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
import { obterCnpjManual } from "./db";

// Categorias fixas (pra bater com o vocabulário que a Júlia já conhece dos
// relatórios do Robô Zen em Python).
export const MOTIVO_PRONTA = "PRONTA";
export const MOTIVO_SEM_PDF = "SEM PDF em Contratos";
export const MOTIVO_SEM_DOC_ELEGIVEL = "SEM DOCUMENTO ELEGÍVEL (só docs fora do escopo)";
export const MOTIVO_CNPJ_NAO_ENCONTRADO = "CNPJ NÃO ENCONTRADO em nenhum documento";
export const MOTIVO_CLIENTE_NAO_CADASTRADO = "CLIENTE NÃO CADASTRADO NO QUESTOR";
export const MOTIVO_ERRO = "ERRO AO CONSULTAR/LER";

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
}

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
  prazoFinal: number
): Promise<ResultadoExtracao> {
  const problemas: string[] = [];
  const escaneados: string[] = [];
  const tocados = new Set<string>();
  const candidatos = ordenarCandidatosParaExtrairDados(elegiveis);
  for (let i = 0; i < candidatos.length; i++) {
    if (Date.now() >= prazoFinal) {
      problemas.push(
        `parou a busca por tempo (limite de segurança da função): tentei ${i} de ` +
          `${candidatos.length} documento(s) elegível(is) — os demais não chegaram a ser lidos`
      );
      break;
    }
    const candidato = candidatos[i];
    tocados.add(candidato.id);
    let dados: DadosCertidao;
    try {
      const bytes = await baixarConteudo(ctx, candidato.id);
      dados = await extrairDadosCertidao(bytes);
    } catch (e) {
      problemas.push(`${candidato.nome}: erro ao ler (${e instanceof Error ? e.message : String(e)})`);
      // Mesma regra "à prova de falha" do pdfPareceEscaneado() original:
      // se nem deu pra extrair nada, trata como "parece escaneado" (mais
      // seguro avisar de mais do que deixar passar batido um documento
      // ilegível sem nenhum aviso).
      escaneados.push(candidato.nome);
      continue;
    }
    if (dados.pareceEscaneado) escaneados.push(candidato.nome);
    if (!dados.cnpj) {
      const motivo = !dados.textoBruto
        ? "não consegui ler nenhum texto deste arquivo (nem mesmo com OCR) — pode ser um PDF " +
          "corrompido, vazio, ou uma digitalização de qualidade muito baixa; confira o arquivo " +
          "direto no SharePoint"
        : "tinha texto, mas não encontrei um CNPJ nele";
      problemas.push(`${candidato.nome}: ${motivo}`);
      continue;
    }
    return { dados, arquivoUsado: candidato, problemas, escaneados, tocados };
  }
  return { dados: null, arquivoUsado: null, problemas, escaneados, tocados };
}

/**
 * Mesma lógica de sempre (só leitura, nunca escreve nada no Questor) —
 * além do resultado de status de sempre, devolve pronto para um envio
 * real quando `pronta=true`: `documentosElegiveis` (os PDFs) e `cnpj` já
 * extraídos, sem precisar repetir OCR/extração no momento do envio.
 */
export async function prepararDadosParaEnvio(ctx: ContextoGraph, empresa: Empresa): Promise<ResultadoPreparo> {
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

  // Busca o CNPJ tentando os candidatos em ordem de prioridade — já
  // aproveita essa mesma extração pra marcar quem "parece escaneado"
  // (dados.pareceEscaneado), em vez de reprocessar tudo de novo abaixo.
  const { dados, arquivoUsado, problemas, escaneados, tocados } = await extrairDadosComFallback(
    ctx,
    elegiveis,
    prazoFinal
  );

  // Só falta checar "parece escaneado" dos elegíveis que a busca acima
  // NÃO chegou a tocar (ela para assim que acha o CNPJ, então o que vier
  // depois do candidato vencedor na ordem pode ter ficado de fora) — só
  // pra esses vale a pena a checagem RÁPIDA (sem OCR, pdfPareceEscaneado),
  // já que não precisam mais tentar achar CNPJ nenhum. Mesmo orçamento de
  // tempo de `extrairDadosComFallback`: se já estourou, nem vale a pena
  // tentar mais downloads só pra essa checagem cosmética.
  for (const doc of elegiveis) {
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

  // cnpjFinal/origemCnpj passam a valer tanto pro CNPJ achado no PDF quanto
  // pro fallback manual abaixo — o resto da função (Questor, mensagens de
  // status) não precisa saber qual dos dois foi.
  let cnpjFinal: string | null = dados?.cnpj ?? null;
  let origemCnpj: string | null = arquivoUsado?.nome ?? null;

  if (!cnpjFinal) {
    // Último recurso, só depois que a busca no PDF (extrairDadosComFallback,
    // incluindo o corte por orçamento de tempo) genuinamente não achou nada
    // — nunca antes disso. Cobre empresas específicas cujo CNPJ não aparece
    // escrito em nenhum documento elegível (ex.: requerimento de empresário
    // individual, que só traz CPF/NIRE); a Júlia registra esses casos um a
    // um em robo_zen_cnpj_manual, então isso só entra em ação pras empresas
    // que ela realmente cadastrou lá — as demais seguem batendo em
    // MOTIVO_CNPJ_NAO_ENCONTRADO exatamente como antes.
    const cnpjManual = await obterCnpjManual(empresa.codigo);
    if (cnpjManual) {
      cnpjFinal = cnpjManual;
      origemCnpj = "informado manualmente (CNPJ não estava em nenhum documento elegível)";
    }
  }

  if (!cnpjFinal) {
    const detalhe = problemas.length > 0 ? problemas.join(" | ") : "nenhum documento elegível pôde ser lido";
    resultado.status = `${MOTIVO_CNPJ_NAO_ENCONTRADO} (${detalhe})`;
    resultado.motivo = MOTIVO_CNPJ_NAO_ENCONTRADO;
    return resultado;
  }

  resultado.cnpj = cnpjFinal;
  resultado.documentoCnpjOrigem = origemCnpj;

  const avisoEscaneados = escaneados.length > 0 ? `, ${escaneados.length} escaneado(s)/sem texto` : "";

  if (!hasQuestorZenToken()) {
    resultado.status = "QUESTOR_ZEN_TOKEN não configurado no servidor — não é possível conferir o cliente no Questor.";
    resultado.motivo = MOTIVO_ERRO;
    return resultado;
  }

  try {
    const cliente = await consultarCliente(cnpjFinal);
    resultado.status =
      `PRONTA (cliente no Questor: ${cliente.Nome ?? ""}, ${elegiveis.length} documento(s)` +
      `${avisoEscaneados}, CNPJ extraído de ${origemCnpj ?? "?"})`;
    resultado.motivo = MOTIVO_PRONTA;
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

  return resultado;
}
