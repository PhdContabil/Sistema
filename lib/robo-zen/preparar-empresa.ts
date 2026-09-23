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
  elegiveis: ArquivoContrato[]
): Promise<ResultadoExtracao> {
  const problemas: string[] = [];
  const escaneados: string[] = [];
  const tocados = new Set<string>();
  for (const candidato of ordenarCandidatosParaExtrairDados(elegiveis)) {
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
  const { dados, arquivoUsado, problemas, escaneados, tocados } = await extrairDadosComFallback(ctx, elegiveis);

  // Só falta checar "parece escaneado" dos elegíveis que a busca acima
  // NÃO chegou a tocar (ela para assim que acha o CNPJ, então o que vier
  // depois do candidato vencedor na ordem pode ter ficado de fora) — só
  // pra esses vale a pena a checagem RÁPIDA (sem OCR, pdfPareceEscaneado),
  // já que não precisam mais tentar achar CNPJ nenhum.
  for (const doc of elegiveis) {
    if (tocados.has(doc.id)) continue;
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
    resultado.status = `${MOTIVO_CNPJ_NAO_ENCONTRADO} (${detalhe})`;
    resultado.motivo = MOTIVO_CNPJ_NAO_ENCONTRADO;
    return resultado;
  }

  resultado.cnpj = dados.cnpj;
  resultado.documentoCnpjOrigem = arquivoUsado?.nome ?? null;

  const avisoEscaneados = escaneados.length > 0 ? `, ${escaneados.length} escaneado(s)/sem texto` : "";

  if (!hasQuestorZenToken()) {
    resultado.status = "QUESTOR_ZEN_TOKEN não configurado no servidor — não é possível conferir o cliente no Questor.";
    resultado.motivo = MOTIVO_ERRO;
    return resultado;
  }

  try {
    const cliente = await consultarCliente(dados.cnpj);
    resultado.status =
      `PRONTA (cliente no Questor: ${cliente.Nome ?? ""}, ${elegiveis.length} documento(s)` +
      `${avisoEscaneados}, CNPJ extraído de ${arquivoUsado?.nome ?? "?"})`;
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
