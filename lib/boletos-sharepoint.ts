// Leitura da planilha de controle de boletos no SharePoint (SERVIDOR).
//
// "As meninas" do financeiro mantêm uma planilha (PLANILHA 2026.xlsx, no site
// /sites/Financeiro) para controlar o envio mensal de boletos/NF. Cada aba
// (uma por equipe/carteira) lista as empresas na coluna "COD Q" — que é o
// código FINANCEIRO da empresa, não o código Questor — e tem uma coluna por
// mês (ex.: "07.2", "08.26", "09.26") marcada "ok" quando aquele ciclo já
// saiu.
//
// Aqui só lemos: casar com as empresas do Diss[i]dio e decidir o que gravar
// é responsabilidade de lib/dissidio-boletos.ts (puro, testável).
//
// Mesma credencial de aplicação usada em empresas-sharepoint.ts — o app já
// tem Sites.Read.All concedido no Azure.

import { obterCredenciaisMS, tokenGraph } from "./pessoas/msconfig";

const GRAPH = "https://graph.microsoft.com/v1.0";

const HOSTNAME = process.env.SP_HOSTNAME || "phdcontabil.sharepoint.com";
const SITE_PATH = process.env.SP_FINANCEIRO_SITE_PATH || "/sites/Financeiro";
/**
 * Pasta (dentro da biblioteca de documentos padrão do site) onde a planilha
 * fica — não está na raiz. Caminho confirmado ao vivo no SharePoint:
 * Documentos > 1 - PHD > CONTAS A RECEBER > PLANILHA FINANCEIRO > PLANILHA 2026.xlsx
 */
const PASTA = process.env.SP_BOLETOS_PASTA ?? "1 - PHD/CONTAS A RECEBER/PLANILHA FINANCEIRO";
const ARQUIVO = process.env.SP_BOLETOS_ARQUIVO || "PLANILHA 2026.xlsx";
/** Caminho completo (pasta + arquivo) dentro da biblioteca de documentos, para mensagens de erro. */
const CAMINHO_ARQUIVO = [PASTA, ARQUIVO].filter(Boolean).join("/");
/** Uma aba por equipe/carteira — as demais (histórico, dados de cliente etc.) não entram. */
const ABAS = (process.env.SP_BOLETOS_ABAS || "Contabil,Digital,Negocios")
  .split(",").map((s) => s.trim()).filter(Boolean);
/**
 * Mês vigente da rodada — ex.: "09.26" = setembro/2026. Antes ficava fixo
 * ("08.26", de quando o reajuste passou a valer), e por isso parou de pegar
 * as marcações "ok" que o financeiro passou a fazer na coluna do mês
 * seguinte: a rodada virou o mês (setembro), a planilha ganhou a coluna
 * "09.26" e o sistema continuou lendo "08.26" para sempre, como se o tempo
 * tivesse parado em agosto. Agora acompanha o mês corrente sozinho; dá pra
 * forçar um mês específico (ex.: pra reprocessar um ciclo antigo) definindo
 * SP_BOLETOS_COLUNA.
 */
function colunaStatusPadrao(): string {
  const agora = new Date();
  const mes = String(agora.getUTCMonth() + 1).padStart(2, "0");
  const ano = String(agora.getUTCFullYear() % 100).padStart(2, "0");
  return `${mes}.${ano}`;
}
const COLUNA_STATUS = process.env.SP_BOLETOS_COLUNA || colunaStatusPadrao();

export class BoletosSharePointErro extends Error {
  status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.status = status;
  }
}

function amigavel(status: number, corpo: string): string {
  if (status === 401) return "Credencial do Microsoft 365 inválida ou expirada.";
  if (status === 403) {
    return "O aplicativo não tem permissão para ler o SharePoint. "
      + "Falta conceder Sites.Read.All (tipo Aplicação) e o consentimento do administrador no Azure.";
  }
  if (status === 404) return `Arquivo ou aba não encontrada em ${HOSTNAME}${SITE_PATH} (${CAMINHO_ARQUIVO}).`;
  if (status === 429) return "Muitas consultas em pouco tempo. Tente de novo em instantes.";
  return `Erro ${status} ao consultar o SharePoint: ${corpo.slice(0, 200)}`;
}

async function graph<T>(token: string, caminho: string): Promise<T> {
  const url = caminho.startsWith("http") ? caminho : GRAPH + caminho;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    throw new BoletosSharePointErro(amigavel(r.status, corpo), r.status);
  }
  return (await r.json()) as T;
}

async function obterToken(): Promise<string> {
  const cred = await obterCredenciaisMS();
  if (cred.origem === "ausente") {
    throw new BoletosSharePointErro("Credenciais do Microsoft 365 não configuradas no servidor.", 500);
  }
  const token = await tokenGraph(cred);
  if (!token) throw new BoletosSharePointErro("Não foi possível obter o token do Microsoft Graph.", 401);
  return token;
}

/** Sem acento, sem caixa, sem espaço sobrando — pra achar a coluna certa mesmo com o cabeçalho digitado diferente. */
function normalizarCabecalho(s: string): string {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export interface LinhaBoletoPlanilha {
  aba: string;
  codigofinanceiro: number;
  empresa: string | null;
  ok: boolean;
}

interface UsedRange {
  values?: (string | number | boolean | null)[][];
}

/**
 * Intervalo fixo usado em vez do `usedRange` calculado pelo Graph.
 *
 * `usedRange` precisa que o Graph varra a aba inteira (formatação, borda
 * etc., não só o conteúdo) para descobrir até onde "foi usado" — em abas
 * antigas com formatação espalhada bem além dos dados reais, isso já deu
 * dois erros diferentes na prática: "RangeExceedsLimit" (400, quando o
 * cálculo estoura um limite) e "MaxRequestDurationExceeded" (504, quando o
 * cálculo simplesmente demora demais). Um intervalo fixo é uma leitura
 * direta, sem esse cálculo, e não sofre nenhum dos dois. Generoso o
 * bastante para qualquer aba de controle de boletos: 78 colunas (A a BZ)
 * por 5.000 linhas.
 */
const INTERVALO_LIDO = "A1:BZ5000";

async function valoresDaAba(
  token: string, driveId: string, itemId: string, aba: string
): Promise<UsedRange> {
  const caminho =
    `/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodeURIComponent(aba)}')`
    + `/range(address='${INTERVALO_LIDO}')`;
  return graph<UsedRange>(token, caminho);
}

async function lerAba(
  token: string, driveId: string, itemId: string, aba: string
): Promise<LinhaBoletoPlanilha[]> {
  const r = await valoresDaAba(token, driveId, itemId, aba);
  const linhas = r.values ?? [];
  if (linhas.length < 2) return [];

  const cabecalho = linhas[0].map((v) => normalizarCabecalho(String(v ?? "")));
  const idxCodigo = cabecalho.findIndex((c) => c.startsWith("cod"));
  const idxStatus = cabecalho.findIndex((c) => c === normalizarCabecalho(COLUNA_STATUS));
  const idxNome = cabecalho.findIndex((c) => c.includes("empresa") || c.includes("razao"));

  if (idxCodigo === -1) {
    throw new BoletosSharePointErro(`Coluna do código não encontrada na aba "${aba}".`, 502);
  }
  if (idxStatus === -1) {
    throw new BoletosSharePointErro(
      `Coluna "${COLUNA_STATUS}" não encontrada na aba "${aba}".`, 502
    );
  }

  const out: LinhaBoletoPlanilha[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const row = linhas[i];
    const cod = Number(row[idxCodigo]);
    if (!Number.isInteger(cod) || cod <= 0) continue;
    const statusRaw = row[idxStatus];
    const ok = typeof statusRaw === "string" && statusRaw.trim().toLowerCase() === "ok";
    out.push({
      aba,
      codigofinanceiro: cod,
      empresa: idxNome >= 0 && row[idxNome] != null ? String(row[idxNome]) : null,
      ok,
    });
  }
  return out;
}

/**
 * Lê as abas configuradas da planilha de boletos.
 *
 * Uma aba com erro (coluna renomeada, por exemplo) não derruba as outras —
 * ela entra em `abasComErro` e o resto segue.
 */
export async function lerBoletosGerados(): Promise<{
  linhas: LinhaBoletoPlanilha[];
  abasComErro: { aba: string; erro: string }[];
}> {
  const token = await obterToken();
  const site = await graph<{ id: string }>(token, `/sites/${HOSTNAME}:${SITE_PATH}`);
  const drive = await graph<{ id: string }>(token, `/sites/${site.id}/drive`);
  // O `root:/` do Graph aceita caminho com várias pastas — cada segmento
  // precisa ser codificado à parte, senão uma "/" dentro do nome da pasta
  // (não é o caso aqui, mas por segurança) quebraria o caminho.
  const caminhoCodificado = CAMINHO_ARQUIVO.split("/").map(encodeURIComponent).join("/");
  const item = await graph<{ id: string }>(
    token, `/drives/${drive.id}/root:/${caminhoCodificado}`
  );

  const todas: LinhaBoletoPlanilha[] = [];
  const abasComErro: { aba: string; erro: string }[] = [];
  for (const aba of ABAS) {
    try {
      todas.push(...(await lerAba(token, drive.id, item.id, aba)));
    } catch (e) {
      abasComErro.push({ aba, erro: e instanceof Error ? e.message : "falha ao ler a aba" });
    }
  }
  return { linhas: todas, abasComErro };
}

export { COLUNA_STATUS, ABAS as ABAS_BOLETOS };
