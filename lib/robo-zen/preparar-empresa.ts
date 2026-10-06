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
import { type DadosCertidao, extrairDadosCertidao, pdfPareceEscaneado } from "./certidao-parser";
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
import { cnpjValido, sugerirDigitosCnpj } from "./cnpj";
import * as dbz from "./db";

// Categorias fixas (pra bater com o vocabulário que a Júlia já conhece dos
// relatórios do Robô Zen em Python).
export const MOTIVO_PRONTA = "PRONTA";
export const MOTIVO_SEM_PDF = "SEM PDF em Contratos";
export const MOTIVO_SEM_DOC_ELEGIVEL = "SEM DOCUMENTO ELEGÍVEL (só docs fora do escopo)";
export const MOTIVO_CNPJ_NAO_ENCONTRADO = "CNPJ NÃO ENCONTRADO em nenhum documento";
export const MOTIVO_CLIENTE_NAO_CADASTRADO = "CLIENTE NÃO CADASTRADO NO QUESTOR";
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
}

const depsPadrao: DepsPreparo = {
  enviosDaEmpresa: dbz.enviosDaEmpresa,
  obterBuscaParcial: dbz.obterBuscaParcial,
  salvarBuscaParcial: dbz.salvarBuscaParcial,
  limparBuscaParcial: dbz.limparBuscaParcial,
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
  memoria: MemoriaBusca = { tentados: new Map(), vencedor: null }
): Promise<ResultadoExtracao> {
  const problemas: string[] = [];
  const escaneados: string[] = [];
  const tocados = new Set<string>();
  const tentadosAgora: DocTentado[] = [];
  // Na ordem de sempre — só o vencedor da última vez passa pra frente.
  const candidatos = ordenarComVencedor(ordenarCandidatosParaExtrairDados(elegiveis), memoria.vencedor);
  for (let i = 0; i < candidatos.length; i++) {
    const candidato = candidatos[i];

    // Já lido numa tentativa anterior (mesma versão do arquivo) e sem CNPJ: não
    // baixa nem faz OCR de novo — só reaproveita o que ficou registrado.
    const previo = memoria.tentados.get(candidato.id);
    if (previo) {
      tocados.add(candidato.id);
      if (previo.problema) problemas.push(previo.problema);
      if (previo.escaneado) escaneados.push(candidato.nome);
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
      };
    }

    tocados.add(candidato.id);
    let dados: DadosCertidao;
    try {
      const bytes = await baixarConteudo(ctx, candidato.id);
      dados = await extrairDadosCertidao(bytes);
    } catch (e) {
      const problema = `${candidato.nome}: erro ao ler (${e instanceof Error ? e.message : String(e)})`;
      problemas.push(problema);
      // Mesma regra "à prova de falha" do pdfPareceEscaneado() original:
      // se nem deu pra extrair nada, trata como "parece escaneado" (mais
      // seguro avisar de mais do que deixar passar batido um documento
      // ilegível sem nenhum aviso).
      escaneados.push(candidato.nome);
      tentadosAgora.push({ id: candidato.id, nome: candidato.nome, modificado_em: candidato.modificadoEm ?? null, problema, escaneado: true });
      continue;
    }
    if (dados.pareceEscaneado) escaneados.push(candidato.nome);
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
  };
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
      resultado.status = `${MOTIVO_CLIENTE_NAO_CADASTRADO} (CRM > Clientes)`;
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
  deps: DepsPreparo = depsPadrao
): Promise<ResultadoPreparo> {
  const prazoFinal = Date.now() + ORCAMENTO_TEMPO_EXTRACAO_MS;
  const resultado = resultadoVazio(empresa);

  let contratos: ArquivoContrato[];
  try {
    contratos = await listarContratos(ctx, empresa);
  } catch (e) {
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
    resultado.cnpj = cls.cnpjConhecido;
    resultado.documentoCnpjOrigem = "(CNPJ do envio anterior)";
    const nomesNovos = cls.novos.map((d) => d.nome).join(", ");
    await conferirClienteNoQuestor(
      resultado,
      cls.cnpjConhecido,
      MOTIVO_PRONTA_DOC_NOVO,
      (nomeCliente) =>
        `${MOTIVO_PRONTA_DOC_NOVO}: ${cls.novos.length} para enviar (${nomesNovos}); ${cls.jaEnviados.length} já enviado(s) ` +
        `antes (cliente no Questor: ${nomeCliente}, CNPJ do envio anterior).${avisoAlterados}`
    );
    return resultado;
  }

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
  const { dados, arquivoUsado, problemas, escaneados, tocados, tentadosAgora, incompleta, naoLidos, totalCandidatos } =
    await extrairDadosComFallback(ctx, elegiveis, prazoFinal, { tentados: aprov.tentados, vencedor });

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

    // Leu tudo e não achou: resultado final (e a memória parcial não serve mais).
    resultado.status = `${MOTIVO_CNPJ_NAO_ENCONTRADO} (${detalhe})`;
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
        : "")
  );

  return resultado;
}
