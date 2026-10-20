/**
 * Núcleo da lógica de "está essa empresa pronta para envio?" — porta de
 * `_preparar_dados_para_envio` / `_extrair_dados_com_fallback` (Python,
 * `app.py` + `main.py`). Usado tanto pela simulação (só leitura) quanto
 * como primeiro passo do envio real (que reaproveita o resultado quando
 * `pronta=true`, sem repetir a extração de CNPJ/OCR).
 */

import type { ArquivoContrato, ContextoGraph, Empresa } from "./empresas-sharepoint";
import { baixarConteudo, listarContratos } from "./empresas-sharepoint";
import { filtrarDocumentosParaEnviar, ordenarCandidatosParaExtrairDados } from "./filtro-documentos";
import {
  type DadosCertidao,
  extrairDadosCertidao,
  lerDeNovoComSegmentacaoAutomatica,
  pdfPareceEscaneado,
} from "./certidao-parser";
import { ClienteNaoEncontradoError, consultarCliente, hasQuestorZenToken, QuestorZenError } from "../questor-zen";
import {
  classificarEnvios,
  MOTIVO_JA_ENVIADA,
  MOTIVO_JA_ENVIADA_ALTERADA,
  MOTIVO_PRONTA_DOC_NOVO,
  type EnvioConhecido,
} from "./novidades-envio";
import {
  aproveitarBuscaParcial,
  MAX_PASSOS_BUSCA,
  mesmaVersao,
  ordenarComVencedor,
  type BuscaParcial,
  type DocTentado,
  type DocVencedor,
} from "./busca-parcial";
import { cnpjValido, formatarCnpj, sugerirDigitosCnpj } from "./cnpj";
import {
  avaliarDocumentoComReferencia,
  avisoCnpjNaoConfirmado,
  cnpjDeReferencia,
  conferirCnpjComCadastro,
  digitosDoCnpj,
  statusCnpjDoEnvioAnteriorErrado,
  statusCnpjErrado,
  statusCnpjNaoConfirmado,
  type CadastroEmpresa,
  type CausaSemReferencia,
  type CnpjsDoDocumento,
} from "./conferencia-cnpj";
import { cadastroDaEmpresa } from "./cadastro-questor";
import { ehErroTransitorio, ehStatusTransitorio } from "./transitorio";
import * as dbz from "./db";

// Categorias fixas (pra bater com o vocabulário que a Júlia já conhece dos
// relatórios do Robô Zen em Python).
export const MOTIVO_PRONTA = "PRONTA";
export const MOTIVO_SEM_PDF = "SEM PDF em Contratos";
export const MOTIVO_SEM_DOC_ELEGIVEL = "SEM DOCUMENTO ELEGÍVEL (só docs fora do escopo)";
export const MOTIVO_CNPJ_NAO_ENCONTRADO = "CNPJ NÃO ENCONTRADO em nenhum documento";
export const MOTIVO_CLIENTE_NAO_CADASTRADO = "CLIENTE NÃO CADASTRADO NO QUESTOR";
/** O CNPJ lido não pôde ser comparado com o do cadastro da empresa no Questor (empresa
 * fora do cadastro ou sem CNPJ válido lá): fica bloqueada por precaução. */
export const MOTIVO_CNPJ_NAO_CONFIRMADO = "CNPJ NÃO CONFIRMADO NO QUESTOR";
export const MOTIVO_ERRO = "ERRO AO CONSULTAR/LER";
/** A busca do CNPJ foi cortada pelo tempo, mas o que já foi lido ficou guardado:
 * a próxima tentativa continua de onde parou (ver lib/robo-zen/busca-parcial.ts). */
export const MOTIVO_BUSCA_INCOMPLETA = "BUSCA INCOMPLETA (continua na próxima tentativa)";

export interface ResultadoPreparo {
  codigo: string;
  nome: string;
  qtdDocumentosElegiveis: number;
  documentosElegiveis: ArquivoContrato[];
  qtdDocumentosEscaneados: number;
  documentosEscaneados: string[];
  qtdDocumentosIgnorados: number;
  documentosIgnorados: string[];
  cnpj: string | null;
  status: string;
  motivo: string;
  pronta: boolean;
  /** Nome do arquivo de onde o CNPJ foi extraído (só quando pronta=true). */
  documentoCnpjOrigem: string | null;
  /** Dos elegíveis, os que AINDA NÃO foram enviados ao Zen — é só isto que o
   * envio individual pode mandar (`documentosElegiveis` continua trazendo todos). */
  documentosParaEnviar: ArquivoContrato[];
  /** Nomes dos elegíveis que já constam em robo_zen_envios. */
  documentosJaEnviados: string[];
  /** Dos já enviados, os mexidos no SharePoint depois do envio (só aviso). */
  documentosAlterados: string[];
  /** A busca do CNPJ parou por tempo mas ficou guardada: quem chama deve tentar
   * de novo (o job da simulação faz isso sozinho no passo seguinte) e a busca
   * continua do documento seguinte. Nunca é `pronta`. */
  buscaIncompleta: boolean;
}

export interface OpcoesPreparo {
  /** Uma PESSOA confere o CNPJ e o cliente do Zen na tela antes de confirmar o envio (consulta e
   * envio individuais). Aí, CNPJ que não pôde ser comparado (empresa fora do cadastro, sem CNPJ
   * válido lá, ou baixada) NÃO bloqueia: a empresa fica pronta COM um aviso visível — é assim que
   * se envia uma empresa que a pessoa liberou à mão. Na varredura (sem ninguém olhando) é
   * bloqueio. CNPJ DIFERENTE do cadastro ("puxando CNPJ errado") bloqueia nos dois casos. */
  confirmacaoManual?: boolean;
}

/** Dependências que dá pra trocar nos testes (o padrão é o banco de verdade). */
export interface DepsPreparo {
  enviosDaEmpresa: (codigo: string) => Promise<EnvioConhecido[]>;
  /** Memória da busca do CNPJ (robo_zen_busca_parcial). Se falhar (ex.: tabela
   * ainda não criada), a busca segue como antes, sem continuar de onde parou. */
  obterBuscaParcial: (codigo: string) => Promise<BuscaParcial | null>;
  salvarBuscaParcial: (
    codigo: string,
    busca: { documentos: DocTentado[]; vencedor: DocVencedor | null; passos: number }
  ) => Promise<void>;
  limparBuscaParcial: (codigo: string) => Promise<void>;
  /** Cadastro da empresa no Questor (o CNPJ de referência pra conferir o que o robô lê
   * nos documentos). Lança se não conseguir consultar. */
  cadastroDaEmpresa: (codigo: string) => Promise<CadastroEmpresa>;
}

const depsPadrao: DepsPreparo = {
  enviosDaEmpresa: dbz.enviosDaEmpresa,
  obterBuscaParcial: dbz.obterBuscaParcial,
  salvarBuscaParcial: dbz.salvarBuscaParcial,
  limparBuscaParcial: dbz.limparBuscaParcial,
  cadastroDaEmpresa,
};

function resultadoVazio(empresa: Empresa): ResultadoPreparo {
  return {
    codigo: empresa.codigo,
    nome: empresa.nome,
    qtdDocumentosElegiveis: 0,
    documentosElegiveis: [],
    qtdDocumentosEscaneados: 0,
    documentosEscaneados: [],
    qtdDocumentosIgnorados: 0,
    documentosIgnorados: [],
    cnpj: null,
    status: "",
    motivo: "",
    pronta: false,
    documentoCnpjOrigem: null,
    documentosParaEnviar: [],
    documentosJaEnviados: [],
    documentosAlterados: [],
    buscaIncompleta: false,
  };
}

interface ResultadoExtracao {
  dados: DadosCertidao | null;
  arquivoUsado: ArquivoContrato | null;
  problemas: string[];
  /** Nomes dos documentos já baixados/extraídos nesta passada (candidatos
   * tentados até achar o CNPJ, ou todos se nenhum tiver funcionado) — pra
   * quem chamar não precisar baixar/extrair de novo só pra saber se
   * "parece escaneado" (ver prepararDadosParaEnvio). */
  escaneados: string[];
  tocados: Set<string>;
  /** Documentos lidos AGORA sem achar CNPJ (os que a busca vai guardar). */
  tentadosAgora: DocTentado[];
  /** A busca parou por tempo antes de cobrir todos os candidatos. */
  incompleta: boolean;
  /** Candidatos que ficaram sem ser lidos (só faz sentido se `incompleta`). */
  naoLidos: number;
  totalCandidatos: number;
  /** O SharePoint falhou de forma passageira (429/502/503/504) ao baixar um
   * documento: a busca parou ali SEM registrar esse documento como "ilegível" —
   * quem chamou guarda o que já foi lido e tenta de novo depois. */
  falhaTransitoria: unknown | null;
  /** Só com CNPJ de referência: documentos que citam CNPJs válidos, NENHUM deles o do
   * cadastro da empresa (é o que fundamenta o "puxando CNPJ ERRADO"). */
  outros: CnpjsDoDocumento[];
}

/** Já lidos antes, sem CNPJ, e o vencedor da última vez (ver busca-parcial.ts). */
interface MemoriaBusca {
  tentados: Map<string, DocTentado>;
  vencedor: ArquivoContrato | null;
}

// Orçamento de tempo (ms), a partir do início de `prepararDadosParaEnvio`,
// pra tentar achar o CNPJ nos documentos elegíveis de UMA empresa.
//
// Existe porque `avancarProcessamento` processa uma empresa por chamada de
// API (maxDuration=60s da função) — se a empresa não tiver nenhum
// documento com nome de Certidão (`ordenarCandidatosParaExtrairDados` não
// consegue priorizar nada) e a maioria dos elegíveis for digitalizada
// (precisa de OCR, que é lento), tentar TODOS sequencialmente pode
// facilmente estourar o tempo da função — e nesse caso a Vercel MATA o
// processo sem dó, antes de salvar qualquer resultado pra essa empresa,
// travando a simulação inteira (a mesma classe de problema do OOM da PR #7
// e do timeout de listagem da PR #8 — só que agora na extração em si).
// Visto travando de verdade em produção: empresa "Le-Telas Industria e
// Comecio" (código 439) tem 17 documentos elegíveis em Contratos, nenhum
// com nome de Certidão, e os primeiros (várias "Alteração Contratual"
// digitalizadas, em partes) já bastam pra estourar os 60s antes da busca
// sequencial chegar em "CONTRATO SOCIAL.pdf" (bem mais pro fim da lista).
//
// Em vez de deixar a função ser morta no meio, paramos de tentar MAIS
// documentos perto desse orçamento e devolvemos o que já der pra apurar —
// a empresa fica marcada como "não deu tempo" (registrado em `problemas`,
// então aparece no motivo/status pra Júlia entender o que aconteceu) em
// vez de simplesmente sumir sem deixar rastro; a simulação segue
// normalmente pra próxima empresa na chamada seguinte.
const ORCAMENTO_TEMPO_EXTRACAO_MS = 40_000;

/**
 * Tenta extrair os dados (CNPJ etc.) tentando CADA documento elegível, na
 * ordem devolvida por `ordenarCandidatosParaExtrairDados` — não só o
 * primeiro/mais provável.
 *
 * Existe por causa de casos reais (caso Ecoplating, no projeto original):
 * a Certidão de Inteiro Teor pode estar salva com um nome que não indica
 * isso, e um documento pode falhar na extração por outros motivos. Em vez
 * de desistir no primeiro candidato, tentamos todos até um funcionar.
 *
 * De quebra, já registra quais dos candidatos TENTADOS aqui "parecem
 * escaneados" (dados.pareceEscaneado, calculado pela mesma extração,
 * sem custo extra) — antes isso era uma segunda passada inteira, baixando
 * e reprocessando (mupdf + OCR) TODOS os documentos elegíveis de novo do
 * zero, só pra descobrir isso. Pra empresas com vários documentos, essa
 * duplicação chegava a estourar os 60s da função na Vercel (timeout real
 * em produção) — por isso a fusão das duas passadas numa só.
 */
async function extrairDadosComFallback(
  ctx: ContextoGraph,
  elegiveis: ArquivoContrato[],
  prazoFinal: number,
  memoria: MemoriaBusca = { tentados: new Map(), vencedor: null },
  referencia: string | null = null
): Promise<ResultadoExtracao> {
  const problemas: string[] = [];
  const escaneados: string[] = [];
  const tocados = new Set<string>();
  const tentadosAgora: DocTentado[] = [];
  const outros: CnpjsDoDocumento[] = [];
  const alvo = referencia ? digitosDoCnpj(referencia) : null;
  // Na ordem de sempre — só o vencedor da última vez passa pra frente.
  const candidatos = ordenarComVencedor(ordenarCandidatosParaExtrairDados(elegiveis), memoria.vencedor);
  for (let i = 0; i < candidatos.length; i++) {
    const candidato = candidatos[i];

    // Já lido numa tentativa anterior (mesma versão do arquivo) e sem CNPJ: não
    // baixa nem faz OCR de novo — só reaproveita o que ficou registrado.
    // Exceção: se a lista de CNPJs que ele citava inclui o do cadastro (que pode ter mudado
    // desde então), vale ler de novo.
    const previo = memoria.tentados.get(candidato.id);
    const citaOCadastro = !!alvo && !!previo?.cnpjs_lidos?.some((c) => digitosDoCnpj(c) === alvo);
    // Escaneado que só passou pela primeira leitura do OCR (guardado antes da segunda existir, ou
    // sem referência na época): com referência em mãos vale a segunda leitura, uma única vez.
    const faltaSegundaLeitura = !!alvo && previo?.escaneado === true && previo.leitura_completa !== true;
    if (previo && !citaOCadastro && !faltaSegundaLeitura) {
      tocados.add(candidato.id);
      if (previo.problema) problemas.push(previo.problema);
      if (previo.escaneado) escaneados.push(candidato.nome);
      if (alvo && previo.cnpjs_lidos?.length) outros.push({ arquivo: candidato.nome, cnpjs: previo.cnpjs_lidos });
      continue;
    }

    if (Date.now() >= prazoFinal) {
      const naoLidos = candidatos.slice(i).filter((c) => !memoria.tentados.has(c.id)).length;
      return {
        dados: null,
        arquivoUsado: null,
        problemas,
        escaneados,
        tocados,
        tentadosAgora,
        incompleta: true,
        naoLidos,
        totalCandidatos: candidatos.length,
        outros,
        falhaTransitoria: null,
      };
    }

    tocados.add(candidato.id);
    let dados: DadosCertidao;
    let bytes: Uint8Array | Buffer;
    try {
      bytes = await baixarConteudo(ctx, candidato.id);
      dados = await extrairDadosCertidao(bytes);
    } catch (e) {
      // SharePoint pediu pra esperar (429) ou ficou fora do ar por instantes
      // (502/503/504): isso não diz NADA sobre o documento. Registrá-lo como
      // "ilegível" seria um falso negativo (e, com a busca guardada, ele nem seria
      // relido) — então a busca para aqui e a tentativa é repetida depois.
      if (ehStatusTransitorio(e)) {
        tocados.delete(candidato.id);
        return {
          dados: null,
          arquivoUsado: null,
          problemas,
          escaneados,
          tocados,
          tentadosAgora,
          incompleta: false,
          naoLidos: 0,
          totalCandidatos: candidatos.length,
          outros,
          falhaTransitoria: e,
        };
      }
      const problema = `${candidato.nome}: erro ao ler (${e instanceof Error ? e.message : String(e)})`;
      problemas.push(problema);
      // Mesma regra "à prova de falha" do pdfPareceEscaneado() original:
      // se nem deu pra extrair nada, trata como "parece escaneado" (mais
      // seguro avisar de mais do que deixar passar batido um documento
      // ilegível sem nenhum aviso).
      escaneados.push(candidato.nome);
      // Falhou ao ler: uma segunda leitura não ajuda (e não deve se repetir a cada tentativa).
      tentadosAgora.push({
        id: candidato.id,
        nome: candidato.nome,
        modificado_em: candidato.modificadoEm ?? null,
        problema,
        escaneado: true,
        leitura_completa: true,
      });
      continue;
    }

    // SEGUNDA LEITURA. Com o CNPJ do cadastro em mãos, um documento ESCANEADO que não o confirma
    // pode ter sido mal lido: a leitura de sempre (bloco único) às vezes atropela os quadros de
    // um formulário e perde o campo do CNPJ (caso da empresa 302). Lê de novo com a análise
    // automática de layout e SOMA o texto — nada do que a primeira achou se perde — e o número
    // novo só vale se for IGUAL ao do cadastro (a conferência abaixo é a mesma de sempre).
    const avaliar = (d: DadosCertidao) =>
      alvo && referencia
        ? avaliarDocumentoComReferencia({ nome: candidato.nome, cnpjDoLeitor: d.cnpj, texto: d.textoBruto }, referencia)
        : null;
    let avaliacao = avaliar(dados);
    let segundaLeitura = false;
    if (avaliacao && avaliacao.tipo !== "USAR" && dados.pareceEscaneado) {
      // Sem tempo pra ela: só adia (o documento volta a ser lido do começo na próxima tentativa,
      // com orçamento novo) — NUNCA registra como "lido sem CNPJ". Se este é o primeiro documento
      // lido neste passo, ela roda de qualquer jeito: senão a busca nunca sairia do lugar.
      if (Date.now() >= prazoFinal && tentadosAgora.length > 0) {
        tocados.delete(candidato.id);
        return {
          dados: null,
          arquivoUsado: null,
          problemas,
          escaneados,
          tocados,
          tentadosAgora,
          incompleta: true,
          naoLidos: candidatos.slice(i).filter((c) => c.id === candidato.id || !memoria.tentados.has(c.id)).length,
          totalCandidatos: candidatos.length,
          outros,
          falhaTransitoria: null,
        };
      }
      segundaLeitura = true;
      try {
        dados = await lerDeNovoComSegmentacaoAutomatica(dados, bytes);
        avaliacao = avaliar(dados);
      } catch (e) {
        // A segunda leitura é um complemento: se ela falha, vale o que a primeira deu.
        problemas.push(`${candidato.nome}: a segunda leitura do OCR falhou (${e instanceof Error ? e.message : String(e)})`);
      }
    }
    const leituraCompleta = segundaLeitura ? true : undefined;
    if (dados.pareceEscaneado) escaneados.push(candidato.nome);

    // Com o CNPJ do cadastro em mãos, o que vale é CONFIRMÁ-LO no documento: um contrato cita
    // vários CNPJs (sócia pessoa jurídica, sindicato, empresa anterior…) e o primeiro válido
    // que aparece pode ser o de outra empresa — que, sendo cliente do Zen, faria o envio ir
    // pro cliente errado. O documento que cita o CNPJ do cadastro é usado com esse CNPJ; o que
    // só cita outros é descartado (e lembrado, pra explicar o "CNPJ errado" se nenhum servir).
    if (avaliacao) {
      if (avaliacao.tipo === "USAR") {
        return {
          dados: { ...dados, cnpj: avaliacao.cnpj },
          arquivoUsado: candidato,
          problemas,
          escaneados,
          tocados,
          tentadosAgora,
          incompleta: false,
          naoLidos: 0,
          falhaTransitoria: null,
          totalCandidatos: candidatos.length,
          outros,
        };
      }
      if (avaliacao.tipo === "DESCARTAR") {
        problemas.push(avaliacao.problema);
        outros.push({ arquivo: candidato.nome, cnpjs: avaliacao.cnpjs });
        tentadosAgora.push({
          id: candidato.id,
          nome: candidato.nome,
          modificado_em: candidato.modificadoEm ?? null,
          problema: avaliacao.problema,
          escaneado: !!dados.pareceEscaneado,
          cnpjs_lidos: avaliacao.cnpjs,
          leitura_completa: leituraCompleta,
        });
        continue;
      }
    }

    if (!dados.cnpj) {
      const motivo = !dados.textoBruto
        ? "não consegui ler nenhum texto deste arquivo (nem mesmo com OCR) — pode ser um PDF " +
          "corrompido, vazio, ou uma digitalização de qualidade muito baixa; confira o arquivo " +
          "direto no SharePoint"
        : "tinha texto, mas não encontrei um CNPJ nele";
      const problema = `${candidato.nome}: ${motivo}`;
      problemas.push(problema);
      tentadosAgora.push({
        id: candidato.id,
        nome: candidato.nome,
        modificado_em: candidato.modificadoEm ?? null,
        problema,
        escaneado: !!dados.pareceEscaneado,
        leitura_completa: leituraCompleta,
      });
      continue;
    }
    // CNPJ lido que não passa na conferência dos dígitos verificadores NÃO existe
    // (o Questor recusaria com "Inscrição Federal Inválida"). Quase sempre é um
    // dígito trocado pelo OCR de um documento escaneado — então não vale como
    // resposta: segue procurando nos outros documentos. Se nenhum tiver um CNPJ
    // válido, a empresa termina como "CNPJ NÃO ENCONTRADO" (com este detalhe no
    // status) — o mesmo destino das que não têm CNPJ escrito em nenhum documento.
    if (!cnpjValido(dados.cnpj)) {
      const sugestao = sugerirDigitosCnpj(dados.cnpj);
      const problema =
        `${candidato.nome}: li o CNPJ ${dados.cnpj}, mas ele não passa na conferência dos dígitos ` +
        "verificadores (provável erro de leitura do OCR" +
        (sugestao
          ? `; se os 12 primeiros dígitos estiverem certos, o CNPJ com os dígitos corretos seria ${sugestao} — ` +
            "confira no documento antes de usar"
          : "") +
        ")";
      problemas.push(problema);
      tentadosAgora.push({
        id: candidato.id,
        nome: candidato.nome,
        modificado_em: candidato.modificadoEm ?? null,
        problema,
        escaneado: !!dados.pareceEscaneado,
        leitura_completa: leituraCompleta,
      });
      continue;
    }
    return {
      dados,
      arquivoUsado: candidato,
      problemas,
      escaneados,
      tocados,
      tentadosAgora,
      incompleta: false,
      naoLidos: 0,
      totalCandidatos: candidatos.length,
      outros,
      falhaTransitoria: null,
    };
  }
  return {
    dados: null,
    arquivoUsado: null,
    problemas,
    escaneados,
    tocados,
    tentadosAgora,
    incompleta: false,
    naoLidos: 0,
    totalCandidatos: candidatos.length,
    outros,
    falhaTransitoria: null,
  };
}

/** O CNPJ da empresa no cadastro do Questor (referência), ou por que não há um. */
interface Referencia {
  cnpj: string | null;
  /** Só vale quando `cnpj` é null: por que não há referência. */
  causa: CausaSemReferencia;
  /** A empresa está baixada (fora da lista de ativas): o CNPJ do cadastro serve pra comparar,
   * mas a empresa que ainda não recebeu nada não é liberada sozinha (ver `prepararDadosParaEnvio`). */
  baixada: boolean;
}

/**
 * Consulta o cadastro do Questor. Devolve null (e já deixa o resultado como ERRO) se não deu
 * pra consultar: sem a referência não dá pra saber se o CNPJ lido é o desta empresa, e
 * seguir sem conferir é justamente o que mandava documentos pro cliente errado. Falha
 * passageira (rede, 502/503/504) sobe pra quem chamou repetir.
 */
async function obterReferencia(
  empresa: Empresa,
  deps: DepsPreparo,
  resultado: ResultadoPreparo
): Promise<Referencia | null> {
  try {
    const cadastro = await deps.cadastroDaEmpresa(empresa.codigo);
    if (!cadastro.encontrada) return { cnpj: null, causa: "ausente", baixada: false };
    return { cnpj: cnpjDeReferencia(cadastro.cnpj), causa: "sem_cnpj", baixada: !cadastro.ativa };
  } catch (e) {
    if (ehErroTransitorio(e)) throw e;
    resultado.status =
      `Não consegui consultar o cadastro de empresas do Questor (${e instanceof Error ? e.message : String(e)}) — ` +
      "sem o CNPJ do cadastro não dá para conferir se o CNPJ lido é o desta empresa";
    resultado.motivo = MOTIVO_ERRO;
    return null;
  }
}

/**
 * CNPJ lido que não ficou confirmado (sem referência pra comparar, ou empresa baixada): a empresa
 * NÃO fica pronta. Ainda assim
 * consulta o Zen (só leitura) pelo CNPJ lido, pra mostrar a quem for decidir o nome do
 * cliente que ele tem lá. Mantém `cnpj`/`documentoCnpjOrigem` (é o que se confere).
 */
async function bloquearNaoConfirmada(
  resultado: ResultadoPreparo,
  empresa: Empresa,
  lido: string,
  causa: CausaSemReferencia
): Promise<void> {
  let clienteNoZen: string | null | undefined;
  if (hasQuestorZenToken()) {
    try {
      clienteNoZen = (await consultarCliente(lido)).Nome ?? "";
    } catch (e) {
      if (e instanceof ClienteNaoEncontradoError) clienteNoZen = null;
      else if (!(e instanceof QuestorZenError)) throw e;
    }
  }
  resultado.pronta = false;
  resultado.motivo = MOTIVO_CNPJ_NAO_CONFIRMADO;
  resultado.status = statusCnpjNaoConfirmado({ codigo: empresa.codigo, lido, causa, clienteNoZen });
}

/**
 * Confere o cliente no Questor (só leitura) e fecha o resultado: pronta, "cliente
 * não cadastrado" ou erro. `montarStatusPronta` recebe o nome do cliente no Questor.
 */
async function conferirClienteNoQuestor(
  resultado: ResultadoPreparo,
  cnpj: string,
  motivoPronta: string,
  montarStatusPronta: (nomeCliente: string) => string
): Promise<void> {
  if (!hasQuestorZenToken()) {
    resultado.status = "QUESTOR_ZEN_TOKEN não configurado no servidor — não é possível conferir o cliente no Questor.";
    resultado.motivo = MOTIVO_ERRO;
    return;
  }

  try {
    const cliente = await consultarCliente(cnpj);
    resultado.status = montarStatusPronta(cliente.Nome ?? "");
    resultado.motivo = motivoPronta;
    resultado.pronta = true;
  } catch (e) {
    if (e instanceof ClienteNaoEncontradoError) {
      // Aqui o CNPJ já foi conferido com o cadastro da empresa: é o CNPJ DELA que não é cliente no Zen.
      resultado.status =
        `${MOTIVO_CLIENTE_NAO_CADASTRADO} (CRM > Clientes): o CNPJ ${cnpj}, que confere com o cadastro desta ` +
        "empresa no Questor, não é cliente no Zen.";
      resultado.motivo = MOTIVO_CLIENTE_NAO_CADASTRADO;
    } else if (e instanceof QuestorZenError) {
      resultado.status = `Erro ao consultar cliente no Questor: ${e.message}`;
      resultado.motivo = MOTIVO_ERRO;
    } else {
      throw e;
    }
  }
}

/**
 * Mesma lógica de sempre (só leitura, nunca escreve nada no Questor) —
 * além do resultado de status de sempre, devolve pronto para um envio
 * real quando `pronta=true`: `documentosElegiveis` (os PDFs) e `cnpj` já
 * extraídos, sem precisar repetir OCR/extração no momento do envio.
 */
export async function prepararDadosParaEnvio(
  ctx: ContextoGraph,
  empresa: Empresa,
  deps: DepsPreparo = depsPadrao,
  opcoes: OpcoesPreparo = {}
): Promise<ResultadoPreparo> {
  const prazoFinal = Date.now() + ORCAMENTO_TEMPO_EXTRACAO_MS;
  const resultado = resultadoVazio(empresa);

  let contratos: ArquivoContrato[];
  try {
    contratos = await listarContratos(ctx, empresa);
  } catch (e) {
    // Falha passageira do SharePoint não é resultado da empresa: sobe pra quem
    // chamou repetir (a varredura tenta de novo no passo seguinte; as telas mostram
    // "tente de novo em instantes"), em vez de gravar um ERRO falso.
    if (ehErroTransitorio(e)) throw e;
    resultado.status = `Erro ao listar a pasta: ${e instanceof Error ? e.message : String(e)}`;
    resultado.motivo = MOTIVO_ERRO;
    return resultado;
  }

  const pdfs = contratos.filter((c) => c.nome.toLowerCase().endsWith(".pdf"));
  if (pdfs.length === 0) {
    resultado.status = MOTIVO_SEM_PDF;
    resultado.motivo = MOTIVO_SEM_PDF;
    return resultado;
  }

  const { elegiveis, ignorados } = filtrarDocumentosParaEnviar(pdfs);
  resultado.qtdDocumentosElegiveis = elegiveis.length;
  resultado.documentosElegiveis = elegiveis;
  resultado.qtdDocumentosIgnorados = ignorados.length;
  resultado.documentosIgnorados = ignorados.map((c) => c.nome);

  if (elegiveis.length === 0) {
    resultado.status = MOTIVO_SEM_DOC_ELEGIVEL;
    resultado.motivo = MOTIVO_SEM_DOC_ELEGIVEL;
    return resultado;
  }

  // O que já foi pro Zen? (registro permanente robo_zen_envios, a mesma chave
  // do envio em lote: código da empresa + nome do arquivo.) Se não der pra
  // saber, a empresa NÃO pode ser dada como pronta — melhor um erro visível do
  // que mandar de novo um contrato que já está lá.
  let envios: EnvioConhecido[];
  try {
    envios = await deps.enviosDaEmpresa(empresa.codigo);
  } catch (e) {
    resultado.status =
      `Não consegui consultar o registro de envios (${e instanceof Error ? e.message : String(e)}) — ` +
      "sem isso não dá para saber o que já foi enviado ao Zen";
    resultado.motivo = MOTIVO_ERRO;
    return resultado;
  }
  const cls = classificarEnvios(elegiveis, envios);
  resultado.documentosParaEnviar = cls.novos;
  resultado.documentosJaEnviados = cls.jaEnviados.map((d) => d.nome);
  resultado.documentosAlterados = cls.alterados.map((d) => d.nome);
  const avisoAlterados =
    cls.alterados.length > 0
      ? ` ATENÇÃO: ${cls.alterados.length} arquivo(s) já enviado(s) foi(ram) alterado(s) no SharePoint depois do envio ` +
        `(${cls.alterados.map((d) => d.nome).join(", ")}) — não são reenviados sozinhos; confira se a versão nova precisa ir ao Zen.`
      : "";

  // Tudo o que é elegível já foi enviado: não há nada a fazer. Nem baixa PDF,
  // nem OCR, nem consulta ao Questor — é o que deixa as varreduras seguintes
  // rápidas (só listam a pasta e comparam com o registro).
  if (cls.jaEnviados.length > 0 && cls.novos.length === 0) {
    resultado.cnpj = cls.cnpjConhecido;
    if (cls.alterados.length > 0) {
      resultado.motivo = MOTIVO_JA_ENVIADA_ALTERADA;
      resultado.status = `${MOTIVO_JA_ENVIADA_ALTERADA}.${avisoAlterados}`;
    } else {
      resultado.motivo = MOTIVO_JA_ENVIADA;
      resultado.status = `${MOTIVO_JA_ENVIADA}: ${cls.jaEnviados.length} documento(s) elegível(is), todos já enviados ao Zen`;
    }
    return resultado;
  }

  // Empresa que já tinha envio e ganhou documento novo: o CNPJ é o do envio
  // anterior (já foi lido e conferido no Questor naquela vez) — não precisa
  // baixar nem fazer OCR de novo, só conferir o cliente e mandar o documento novo.
  if (cls.jaEnviados.length > 0 && cls.cnpjConhecido) {
    // O CNPJ do envio anterior também passa pela conferência com o cadastro: se ele não for o
    // desta empresa, o documento novo iria pro mesmo cliente errado dos anteriores.
    const referencia = await obterReferencia(empresa, deps, resultado);
    if (!referencia) return resultado;
    const anterior = digitosDoCnpj(cls.cnpjConhecido) ? formatarCnpj(cls.cnpjConhecido) : cls.cnpjConhecido;
    let avisoNaoConfirmada = "";
    if (!referencia.cnpj) {
      if (!opcoes.confirmacaoManual) {
        resultado.cnpj = cls.cnpjConhecido;
        resultado.documentoCnpjOrigem = "(CNPJ do envio anterior)";
        await bloquearNaoConfirmada(resultado, empresa, anterior, referencia.causa);
        return resultado;
      }
      avisoNaoConfirmada = avisoCnpjNaoConfirmado(empresa.codigo, referencia.causa);
    } else if (digitosDoCnpj(cls.cnpjConhecido) !== digitosDoCnpj(referencia.cnpj)) {
      resultado.status = statusCnpjDoEnvioAnteriorErrado(anterior, referencia.cnpj);
      resultado.motivo = MOTIVO_CNPJ_NAO_ENCONTRADO;
      return resultado;
    }
    resultado.cnpj = cls.cnpjConhecido;
    resultado.documentoCnpjOrigem = "(CNPJ do envio anterior)";
    const nomesNovos = cls.novos.map((d) => d.nome).join(", ");
    await conferirClienteNoQuestor(
      resultado,
      cls.cnpjConhecido,
      MOTIVO_PRONTA_DOC_NOVO,
      (nomeCliente) =>
        `${MOTIVO_PRONTA_DOC_NOVO}: ${cls.novos.length} para enviar (${nomesNovos}); ${cls.jaEnviados.length} já enviado(s) ` +
        `antes (cliente no Questor: ${nomeCliente}, CNPJ do envio anterior).${avisoAlterados}${avisoNaoConfirmada}`
    );
    return resultado;
  }

  // O CNPJ desta empresa no cadastro do Questor: é com ele que o CNPJ lido nos documentos é
  // conferido (um contrato cita vários CNPJs, e o primeiro válido pode ser de outra empresa).
  const referencia = await obterReferencia(empresa, deps, resultado);
  if (!referencia) return resultado;

  // O que já foi lido numa tentativa anterior desta empresa (e não tinha CNPJ)?
  // Se a tabela não existir ou o banco falhar, segue como antes: a busca só
  // não consegue continuar de onde parou.
  let busca: BuscaParcial | null = null;
  let memoriaDisponivel = true;
  try {
    busca = await deps.obterBuscaParcial(empresa.codigo);
  } catch {
    memoriaDisponivel = false;
  }
  const aprov = aproveitarBuscaParcial(elegiveis, busca, Date.now());
  const documentoDe = (c: { id: string }) => elegiveis.find((d) => d.id === c.id) ?? null;
  const vencedor = aprov.vencedor ? documentoDe(aprov.vencedor) : null;

  // Já gastou todas as chamadas permitidas e ainda não achou: desiste (e limpa a
  // memória, pra uma nova tentativa manual recomeçar do zero).
  if (aprov.esgotada) {
    const lidos = [...aprov.tentados.values()];
    resultado.qtdDocumentosEscaneados = lidos.filter((d) => d.escaneado).length;
    resultado.documentosEscaneados = lidos.filter((d) => d.escaneado).map((d) => d.nome);
    const detalhe = lidos.map((d) => d.problema).filter(Boolean).join(" | ");
    resultado.status =
      `${MOTIVO_CNPJ_NAO_ENCONTRADO} (desisti depois de ${aprov.passos} tentativas seguidas, ` +
      `${lidos.length} de ${elegiveis.length} documento(s) lidos${detalhe ? `: ${detalhe}` : ""} — ` +
      "confira os arquivos direto no SharePoint)";
    resultado.motivo = MOTIVO_CNPJ_NAO_ENCONTRADO;
    if (memoriaDisponivel) await deps.limparBuscaParcial(empresa.codigo).catch(() => {});
    return resultado;
  }

  // Número desta tentativa. Quando está continuando uma busca, já registra no
  // banco ANTES do trabalho pesado: se a função for morta no meio, a tentativa
  // conta mesmo assim e o teto de tentativas protege contra laço infinito.
  const continuando = aprov.tentados.size > 0;
  const passosAgora = aprov.passos + 1;
  if (continuando && memoriaDisponivel) {
    await deps
      .salvarBuscaParcial(empresa.codigo, {
        documentos: [...aprov.tentados.values()],
        vencedor: busca?.vencedor ?? null,
        passos: passosAgora,
      })
      .catch(() => {});
  }

  // Busca o CNPJ tentando os candidatos em ordem de prioridade — já
  // aproveita essa mesma extração pra marcar quem "parece escaneado"
  // (dados.pareceEscaneado), em vez de reprocessar tudo de novo abaixo.
  const { dados, arquivoUsado, problemas, escaneados, tocados, tentadosAgora, incompleta, naoLidos, totalCandidatos, falhaTransitoria, outros } =
    await extrairDadosComFallback(ctx, elegiveis, prazoFinal, { tentados: aprov.tentados, vencedor }, referencia.cnpj);

  // SharePoint falhou de forma passageira no meio da busca: guarda o que já foi lido
  // (pra não refazer) e devolve a falha — a tentativa se repete depois, sem nenhum
  // documento marcado como ilegível por causa disso.
  if (falhaTransitoria) {
    const lidos = [...aprov.tentados.values(), ...tentadosAgora];
    if (memoriaDisponivel && lidos.length > 0) {
      await deps
        .salvarBuscaParcial(empresa.codigo, {
          documentos: lidos,
          vencedor: busca?.vencedor ?? null,
          passos: continuando ? passosAgora : aprov.passos,
        })
        .catch(() => {});
    }
    throw falhaTransitoria;
  }

  // Só falta checar "parece escaneado" dos elegíveis que a busca acima
  // NÃO chegou a tocar (ela para assim que acha o CNPJ, então o que vier
  // depois do candidato vencedor na ordem pode ter ficado de fora) — só
  // pra esses vale a pena a checagem RÁPIDA (sem OCR, pdfPareceEscaneado),
  // já que não precisam mais tentar achar CNPJ nenhum. Mesmo orçamento de
  // tempo de `extrairDadosComFallback`: se já estourou, nem vale a pena
  // tentar mais downloads só pra essa checagem cosmética.
  for (const doc of elegiveis) {
    if (incompleta) break;
    if (tocados.has(doc.id)) continue;
    if (Date.now() >= prazoFinal) break;
    try {
      const bytes = await baixarConteudo(ctx, doc.id);
      if (await pdfPareceEscaneado(bytes)) escaneados.push(doc.nome);
    } catch {
      // Falha ao baixar pra só checar isso não deve travar a simulação —
      // o documento simplesmente não aparece na lista de "escaneados".
    }
  }
  resultado.qtdDocumentosEscaneados = escaneados.length;
  resultado.documentosEscaneados = escaneados;

  if (!dados || !dados.cnpj) {
    const detalhe = problemas.length > 0 ? problemas.join(" | ") : "nenhum documento elegível pôde ser lido";

    if (incompleta) {
      // Cortada pelo tempo. Guarda o que já foi lido pra a próxima tentativa
      // continuar do documento seguinte — e só então avisa que é "incompleta".
      const lidosTotal = [...aprov.tentados.values(), ...tentadosAgora];
      let guardou = false;
      if (memoriaDisponivel) {
        try {
          await deps.salvarBuscaParcial(empresa.codigo, {
            documentos: lidosTotal,
            vencedor: busca?.vencedor ?? null,
            passos: passosAgora,
          });
          guardou = true;
        } catch {
          guardou = false;
        }
      }
      if (guardou) {
        resultado.buscaIncompleta = true;
        resultado.status =
          `${MOTIVO_BUSCA_INCOMPLETA}: li ${totalCandidatos - naoLidos} de ${totalCandidatos} documento(s) sem achar CNPJ ` +
          `(tentativa ${passosAgora} de ${MAX_PASSOS_BUSCA}) — a busca continua de onde parou na próxima tentativa` +
          (problemas.length > 0 ? ` [${problemas.join(" | ")}]` : "");
        resultado.motivo = MOTIVO_BUSCA_INCOMPLETA;
        return resultado;
      }
      // Sem onde guardar (tabela ausente / banco falhou): comportamento antigo.
      resultado.status =
        `${MOTIVO_CNPJ_NAO_ENCONTRADO} (${[
          ...problemas,
          `parou a busca por tempo (limite de segurança da função): tentei ${totalCandidatos - naoLidos} de ` +
            `${totalCandidatos} documento(s) elegível(is) — os demais não chegaram a ser lidos`,
        ].join(" | ")})`;
      resultado.motivo = MOTIVO_CNPJ_NAO_ENCONTRADO;
      return resultado;
    }

    // Leu tudo e não achou: resultado final (e a memória parcial não serve mais). Se havia
    // CNPJs válidos nos documentos e NENHUM é o do cadastro, o robô estaria puxando o CNPJ
    // errado: o status diz isso (com o que foi lido), pra quem confere saber onde olhar.
    const conferencia = conferirCnpjComCadastro(outros, referencia.cnpj);
    resultado.status =
      conferencia.tipo === "DIFERENTE"
        ? statusCnpjErrado(conferencia.lidos, conferencia.cadastro)
        : `${MOTIVO_CNPJ_NAO_ENCONTRADO} (${detalhe})`;
    resultado.motivo = MOTIVO_CNPJ_NAO_ENCONTRADO;
    if (busca && memoriaDisponivel) await deps.limparBuscaParcial(empresa.codigo).catch(() => {});
    return resultado;
  }

  // Achou. Guarda de qual documento saiu (a próxima busca tenta ele primeiro) e
  // zera o que havia de busca parcial — só escreve se mudou alguma coisa.
  if (memoriaDisponivel && arquivoUsado) {
    const igualAoGuardado = !!busca?.vencedor && mesmaVersao(arquivoUsado, busca.vencedor);
    if (!igualAoGuardado || (busca?.documentos.length ?? 0) > 0 || (busca?.passos ?? 0) > 0) {
      await deps
        .salvarBuscaParcial(empresa.codigo, {
          documentos: [],
          vencedor: { id: arquivoUsado.id, nome: arquivoUsado.nome, modificado_em: arquivoUsado.modificadoEm ?? null },
          passos: 0,
        })
        .catch(() => {});
    }
  }

  resultado.cnpj = dados.cnpj;
  resultado.documentoCnpjOrigem = arquivoUsado?.nome ?? null;

  // Sem CNPJ do cadastro pra comparar, o CNPJ lido não está confirmado: não fica pronta. Empresa
  // BAIXADA que ainda não recebeu nada também fica de fora até alguém liberar (é a lista dos "CNPJ
  // não confirmado" que a Júlia revisa; documento de distrato, por exemplo, pode ser o motivo).
  let avisoNaoConfirmada = "";
  if (!referencia.cnpj || referencia.baixada) {
    const causa: CausaSemReferencia = referencia.cnpj ? "baixada" : referencia.causa;
    if (!opcoes.confirmacaoManual) {
      await bloquearNaoConfirmada(resultado, empresa, dados.cnpj, causa);
      return resultado;
    }
    avisoNaoConfirmada = avisoCnpjNaoConfirmado(empresa.codigo, causa);
  }

  const avisoEscaneados = escaneados.length > 0 ? `, ${escaneados.length} escaneado(s)/sem texto` : "";

  // Se a empresa já tinha envio (mas sem CNPJ aproveitável no registro), o que
  // sobra é igualmente "documento novo" — só o motivo muda.
  const motivoPronta = cls.jaEnviados.length > 0 ? MOTIVO_PRONTA_DOC_NOVO : MOTIVO_PRONTA;
  await conferirClienteNoQuestor(
    resultado,
    dados.cnpj,
    motivoPronta,
    (nomeCliente) =>
      `PRONTA (cliente no Questor: ${nomeCliente}, ${elegiveis.length} documento(s)` +
      `${avisoEscaneados}, CNPJ extraído de ${arquivoUsado?.nome ?? "?"})` +
      (cls.jaEnviados.length > 0
        ? ` — ${cls.novos.length} novo(s) para enviar, ${cls.jaEnviados.length} já enviado(s) antes.${avisoAlterados}`
        : "") +
      avisoNaoConfirmada
  );

  return resultado;
}
