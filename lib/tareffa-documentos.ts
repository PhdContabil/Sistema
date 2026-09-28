// Publicação de documentos no Tareffa (Ottimizza) — SERVIDOR.
//
// Mesmo fluxo da tela "Serviços Programados > clipe > Baixa de Serviços >
// Adicionar Arquivos > Enviar": depois da postagem o Tareffa lê o PDF,
// identifica serviço, empresa e competência e dá a baixa sozinho. O
// acompanhamento fica em "Log de Documentos Publicados".
//
// Porta de `tareffa_publicar_documento.py` (chamadas capturadas de um envio
// real em 28/09/2026), com o token vindo do OAuth em vez de copiado à mão:
//   0) POST oauth.ottimizza.com.br/oauth/token          (password grant)
//   1) POST s3.tareffaapp.com.br:55325/.../store        (multipart)
//   2) PUT  shorturl/v2/shortify                        (text/plain, sem token)
//   3) POST prd-api-oauth-tareffa/services/documentos   (JSON)
//
// Diferente de lib/societario/tareffa.ts, que é outra API (Tareffa
// Societário, token fixo) e não tem nada a ver com esta.

import { nomeTareffa } from "./tareffa-formato";

export { nomeTareffa };

const OAUTH = "https://oauth.ottimizza.com.br/oauth/token";
const STORAGE = "https://s3.tareffaapp.com.br:55325";
const SHORT = "https://prd-api-tareffa-shorturl-spring.ottimizza.dev";
const API = "https://prd-api-oauth-tareffa.ottimizza.dev/services";
const UPLOAD_APP_ID = "tareffa-oauth";
// Cada passo tem 20 s: a emissão da DARE já gasta boa parte do tempo da
// função com Sefaz e Zen, e o Tareffa é o último elo.
const TIMEOUT_MS = 20_000;

/** Contabilidade e usuário publicador, como no envio real capturado. */
const CONTABILIDADE = {
  id: Number(process.env.TAREFFA_CONTABILIDADE_ID ?? 519774),
  razaoSocial: "PHD CONTABIL LTDA",
  nomeResumido: "Phdcontabil",
  cnpj: "11.274.011/0001-86",
};
const USUARIO = {
  id: Number(process.env.TAREFFA_USUARIO_ID ?? 2146184),
  nome: process.env.TAREFFA_USUARIO_NOME ?? "Gabriel dos Santos Pereira",
  email: process.env.TAREFFA_USUARIO_EMAIL ?? "gabriel@phdcontabil.com.br",
};

export class TareffaError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "TareffaError";
  }
}

/** Há credencial para publicar? OAuth completo, ou o token manual de reserva. */
export function tareffaConfigurado(): boolean {
  const e = process.env;
  return Boolean(
    (e.TAREFFA_CLIENT_ID && e.TAREFFA_CLIENT_SECRET && e.TAREFFA_EMAIL && e.TAREFFA_SENHA)
    || e.TAREFFA_TOKEN
  );
}

// -------------------------------------------------------------------- token

let cache: { token: string; vence: number } | null = null;

/**
 * Token do Tareffa. Dura ~12 h; guardado em memória e renovado 10 min antes.
 * Só o password grant funciona nesse client (client_credentials está
 * desabilitado na Ottimizza).
 */
async function token(): Promise<string> {
  if (cache && Date.now() < cache.vence) return cache.token;

  const e = process.env;
  if (e.TAREFFA_CLIENT_ID && e.TAREFFA_CLIENT_SECRET && e.TAREFFA_EMAIL && e.TAREFFA_SENHA) {
    if (e.TAREFFA_CLIENT_SECRET.startsWith("$2a$")) {
      // Armadilha documentada: a Ottimizza já mandou o hash bcrypt do banco.
      throw new TareffaError("TAREFFA_CLIENT_SECRET está em bcrypt ($2a$...). É preciso o secret em texto puro.");
    }
    const basic = Buffer.from(`${e.TAREFFA_CLIENT_ID}:${e.TAREFFA_CLIENT_SECRET}`).toString("base64");
    const r = await fetch(OAUTH, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "password", username: e.TAREFFA_EMAIL, password: e.TAREFFA_SENHA }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!r.ok || !j.access_token) {
      throw new TareffaError(`OAuth do Tareffa recusou (HTTP ${r.status}): ${j.error_description ?? "sem detalhe"}`);
    }
    const segundos = Number(j.expires_in ?? 43_199);
    cache = { token: j.access_token, vence: Date.now() + Math.max(60, segundos - 600) * 1000 };
    return j.access_token;
  }

  if (e.TAREFFA_TOKEN) return e.TAREFFA_TOKEN.replace(/^Bearer\s+/i, "");
  throw new TareffaError("Tareffa não configurado: faltam TAREFFA_CLIENT_ID, TAREFFA_CLIENT_SECRET, TAREFFA_EMAIL e TAREFFA_SENHA.");
}

async function lerJson(r: Response, etapa: string): Promise<Record<string, unknown>> {
  const texto = await r.text().catch(() => "");
  if (!r.ok) {
    if (r.status === 401) cache = null; // token vencido no meio: a próxima tentativa gera outro
    throw new TareffaError(`${etapa}: HTTP ${r.status} ${texto.slice(0, 300)}`);
  }
  let j: Record<string, unknown>;
  try { j = JSON.parse(texto); } catch { throw new TareffaError(`${etapa}: resposta não é JSON (${texto.slice(0, 200)})`); }
  // Sucesso é status "success" (ou ausente); HTTP 200 sozinho não basta.
  if (j.status != null && j.status !== "success") {
    throw new TareffaError(`${etapa}: ${String(j.message ?? j.status)}`);
  }
  return j;
}

// ------------------------------------------------------------------ publicar

export interface ResultadoTareffa {
  documentoId: string;
  nomeDocumento: string;
  url: string;
}

/**
 * Publica um PDF no Tareffa. Lança TareffaError com o motivo em português
 * quando qualquer das três etapas falha.
 */
export async function publicarNoTareffa(nomeArquivo: string, pdf: Buffer): Promise<ResultadoTareffa> {
  if (pdf.length === 0) throw new TareffaError("PDF vazio — nada a publicar.");
  const t = await token();
  const nome = nomeTareffa(nomeArquivo);

  // 1) upload
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), nome);
  const up = await lerJson(
    await fetch(`${STORAGE}/storage/${UPLOAD_APP_ID}/accounting/${CONTABILIDADE.nomeResumido}/store`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch((e) => { throw new TareffaError(`upload: sem conexão com o storage do Tareffa (${e instanceof Error ? e.message : e})`); }),
    "upload"
  );
  const storageId = (up.record as { id?: string } | undefined)?.id;
  if (!storageId) throw new TareffaError("upload: o Tareffa não devolveu o id do arquivo.");

  // 2) link curto
  const sh = await lerJson(
    await fetch(`${SHORT}/v2/shortify`, {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: `${STORAGE}/storage/${storageId}/download`,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
    "shortify"
  );
  const url = String(sh.fullURL ?? "");
  if (!url) throw new TareffaError("shortify: o Tareffa não devolveu o link do arquivo.");

  // 3) publica
  const doc = await lerJson(
    await fetch(`${API}/documentos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, Accept: "application/json", "Content-Type": "application/json;charset=utf-8" },
      body: JSON.stringify({
        id: null,
        nomeDocumento: nome,
        externalId: storageId,
        url,
        createdAt: new Date().toISOString(),
        empresa: null,
        contabilidade: CONTABILIDADE,
        usuario: USUARIO,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
    "documentos"
  );
  const id = (doc.record as { id?: unknown } | undefined)?.id;
  return { documentoId: String(id ?? storageId), nomeDocumento: nome, url };
}
