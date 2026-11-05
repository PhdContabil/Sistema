// Log dos Lucros Distribuídos na lista do SharePoint (como era no Access).
//
// No Access cada lançamento gravava uma linha na lista LogOperacoes_lucros_distribuidos
// e o fluxo do Power Automate que já existe, disparado por "item criado", postava
// o aviso no Teams. Aqui o servidor grava a mesma linha pela Microsoft Graph, e o
// fluxo existente continua sendo o único responsável pela mensagem.
//
// Variáveis (Vercel, só no servidor — nunca no navegador nem em log):
//   SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET
//   SHAREPOINT_SITE_ID, SHAREPOINT_LISTA_LUCROS_ID
//   SHAREPOINT_LUCROS_CAMPOS (opcional): JSON com os nomes internos das colunas, se diferirem do padrão.
// Sem elas o log fica desligado e o lançamento segue normal.

import type { DadosAvisoLucro } from "./notificacao-teams.ts";

export type ResultadoLogSp = "gravado" | "desligado" | "falhou";

const STATUS: Record<DadosAvisoLucro["evento"], string> = {
  novo: "1º LANÇAMENTO",
  alterado: "LANÇAMENTO ALTERADO",
  excluido: "LANÇAMENTO EXCLUIDO",
};

export const CAMPOS_PADRAO = {
  empresa: "CODIGOEMPRESA", nomeEmpresa: "NOMEESTAB", nomeSocio: "NOMESOCIO", codigoSocio: "CODIGOSOCIO",
  competencia: "COMPETENCIA", valor: "VALORRENDPAGO", responsavel: "RESPONSAVEL", dataHora: "DATAHORA",
  status: "STATUS", imposto: "IMPOSTO",
} as const;
export type Campos = Record<keyof typeof CAMPOS_PADRAO, string>;

/** Campos da linha, com os mesmos valores que o Access gravava. */
export function montarCamposSp(d: DadosAvisoLucro, responsavel: string, agora = new Date(), c: Campos = { ...CAMPOS_PADRAO }) {
  return {
    [c.empresa]: d.codigoempresa,
    [c.nomeEmpresa]: d.nomeEmpresa ?? "",
    [c.nomeSocio]: d.nomeSocio ?? `Sócio ${d.codigosocio}`,
    [c.codigoSocio]: d.codigosocio,
    [c.competencia]: d.competencia.slice(0, 7),
    [c.valor]: d.rendimento,
    [c.responsavel]: responsavel,
    [c.dataHora]: agora.toISOString(),
    [c.status]: STATUS[d.evento],
    [c.imposto]: d.imposto,
  };
}

interface OpcoesSp { env?: Record<string, string | undefined>; fetchFn?: typeof fetch; timeoutMs?: number; agora?: Date }

/** Grava a linha. Nunca lança e nunca registra segredo nem resposta da Graph. */
export async function registrarLogSharepoint(d: DadosAvisoLucro, responsavel: string, o: OpcoesSp = {}): Promise<ResultadoLogSp> {
  const env = o.env ?? process.env;
  const t = env.SHAREPOINT_TENANT_ID, id = env.SHAREPOINT_CLIENT_ID, seg = env.SHAREPOINT_CLIENT_SECRET;
  const site = env.SHAREPOINT_SITE_ID, lista = env.SHAREPOINT_LISTA_LUCROS_ID;
  if (!t || !id || !seg || !site || !lista) return "desligado";
  const f = o.fetchFn ?? fetch;
  const sinal = () => AbortSignal.timeout(o.timeoutMs ?? 8000);
  try {
    let campos: Campos = { ...CAMPOS_PADRAO };
    if (env.SHAREPOINT_LUCROS_CAMPOS) campos = { ...campos, ...JSON.parse(env.SHAREPOINT_LUCROS_CAMPOS) };

    const tk = await f(`https://login.microsoftonline.com/${encodeURIComponent(t)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: id, client_secret: seg, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
      signal: sinal(),
    });
    if (!tk.ok) { console.error(`[sharepoint] token recusado (HTTP ${tk.status})`); return "falhou"; }
    const { access_token } = (await tk.json()) as { access_token?: string };
    if (!access_token) { console.error("[sharepoint] token ausente"); return "falhou"; }

    const r = await f(`https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(site)}/lists/${encodeURIComponent(lista)}/items`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: montarCamposSp(d, responsavel, o.agora, campos) }),
      signal: sinal(),
    });
    if (!r.ok) { console.error(`[sharepoint] gravação recusada (HTTP ${r.status})`); return "falhou"; }
    return "gravado";
  } catch (e) {
    console.error("[sharepoint] falha ao gravar log:", e instanceof Error ? e.name : "erro");
    return "falhou";
  }
}
