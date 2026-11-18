// Fiscal · DCTFWeb — regras puras (sem rede, sem banco), testáveis.

export type SituacaoDctf = "pendente" | "em_andamento" | "transmitida" | "erro";

export interface Mensagem { codigo?: string; texto?: string }

/** Códigos de <sistemaUsuarioDctf> -> origem (validado no portal da RFB). */
const SIS_ORIGEM: Record<string, string> = { "1": "eSocial", "6": "REINF CP", "7": "REINF RET", "8": "MIT" };
const ORDEM_ORIGEM = ["eSocial", "REINF CP", "REINF RET", "MIT"];

export function origemDoXml(xml: string | null): string | null {
  if (!xml) return null;
  const codes = [...new Set([...xml.matchAll(/<sistemaUsuarioDctf>([^<]+)<\/sistemaUsuarioDctf>/g)].map((m) => m[1].trim()))];
  if (!codes.length) return null;
  const nomes = [...new Set(codes.map((c) => SIS_ORIGEM[c] ?? `cod ${c}`))];
  const pos = (n: string) => { const i = ORDEM_ORIGEM.indexOf(n); return i < 0 ? 99 : i; };
  return nomes.sort((a, b) => pos(a) - pos(b)).join(", ");
}

/** Valor da guia = soma dos <saldoaPagar> da declaração. */
export function valorDoXml(xml: string | null): number | null {
  if (!xml) return null;
  const vals = [...xml.matchAll(/<saldoaPagar>([^<]+)<\/saldoaPagar>/g)].map((m) => Number(m[1].replace(",", ".")) || 0);
  if (!vals.length) return null;
  return Math.round(vals.reduce((s, v) => s + v, 0) * 100) / 100;
}

/** XML (string) do retorno do CONSXMLDECLARACAO38 (`dados` já parseado). */
export function xmlDosDados(dados: unknown): string | null {
  const d = dados as { XMLStringBase64?: string; xmlStringBase64?: string } | null;
  const b64 = d?.XMLStringBase64 ?? d?.xmlStringBase64 ?? null;
  return b64 ? Buffer.from(b64, "base64").toString("utf-8") : null;
}

/** Situação a partir das mensagens do CONSDECCOMPLETA33. */
/**
 * Situação a partir da consulta da declaração (CONSDECCOMPLETA33).
 * Só é "transmitida" com PROVA: a Receita devolveu a declaração (dados com
 * conteúdo) e nada diz que ela não existe. HTTP 200 sozinho NÃO basta — a
 * Receita responde 200 com aviso "não foi encontrada declaração" quando não
 * houve transmissão (era o erro que marcava empresa sem entrega como transmitida).
 */
export function situacaoDasMensagens(httpStatus: number, mensagens: Mensagem[] | null | undefined, dados?: unknown): SituacaoDctf {
  const msgs = (mensagens ?? []).map((m) => `${m.texto ?? ""} ${m.codigo ?? ""}`.toLowerCase()).join(" | ");
  if (/em andamento/.test(msgs)) return "em_andamento";
  if (/n[aã]o\s+(foi\s+)?(encontrad|localizad|existe)|inexistente|nenhuma\s+declara|sem\s+declara/.test(msgs)) return "pendente";
  if (httpStatus >= 200 && httpStatus < 300 && temConteudo(dados)) return "transmitida";
  return "pendente";
}

/** A Receita devolveu algo de fato (PDF/objeto/lista não vazios)? */
export function temConteudo(dados: unknown): boolean {
  if (dados == null) return false;
  if (typeof dados === "string") {
    const t = dados.trim();
    if (!t || t === "{}" || t === "[]" || t === "null") return false;
    try { return temConteudo(JSON.parse(t)); } catch { return t.length > 20; }
  }
  if (Array.isArray(dados)) return dados.some(temConteudo);
  if (typeof dados === "object") return Object.values(dados as Record<string, unknown>).some((v) => v != null && v !== "" && (typeof v !== "object" || temConteudo(v)));
  return true;
}

/** Transmissão OK = HTTP 2xx + mensagem de sucesso ([Sucesso-DCTFWEB]); não vem número de recibo. */
export function transmissaoComSucesso(httpStatus: number, mensagens: Mensagem[] | null | undefined): boolean {
  return httpStatus >= 200 && httpStatus < 300
    && (mensagens ?? []).some((m) => /sucesso/i.test(m.codigo ?? "") || /sucesso/i.test(m.texto ?? ""));
}

/** "Já transmitida" não é erro: a RFB bloqueia retransmissão. */
export function ehJaTransmitida(mensagens: Mensagem[] | null | undefined): boolean {
  return (mensagens ?? []).some((m) => /Ja_Transmitida|j[aá]\s*transmitida/i.test(`${m.texto ?? ""} ${m.codigo ?? ""}`));
}

/** Motivo pelo qual uma linha NÃO entra na transmissão (null = elegível). */
export function motivoBloqueio(l: { situacao: string; nao_transmitir: boolean; debito: number | string | null }): string | null {
  if (l.situacao === "transmitida") return "já transmitida";
  if (l.nao_transmitir) return "trava manual";
  if (!(Number(l.debito) > 0)) return "sem débito apurado";
  return null;
}

export const TOLERANCIA_DIVERGENCIA = 0.05;

/**
 * Débito do Questor × valor da guia na RFB, com 5% de tolerância (deduções
 * como salário-família). Divergência numa transmitida costuma ser REINF que
 * entrou depois: a declaração voltou para "em andamento" na Receita.
 */
export function divergente(debito: number | string | null, valorGuia: number | string | null): boolean {
  const d = Number(debito), v = Number(valorGuia);
  if (valorGuia == null || !(d > 0)) return false;
  return Math.abs(d - v) / d > TOLERANCIA_DIVERGENCIA;
}

/** Motivo amigável quando a guia não sai (texto de todas as tentativas, minúsculo). */
export function motivoSemGuia(textoMensagens: string): string {
  const t = textoMensagens.toLowerCase();
  if (/n[aã]o foi encontrada declara/.test(t)) return "Sem declaração na Receita para esta competência.";
  if (/exce[çc][aã]o|inesper|construtordados|instancia/.test(t)) {
    return "A Receita falhou ao montar a guia da declaração em andamento. Transmita a declaração (a guia passa a sair) ou emita pelo e-CAC.";
  }
  if (/n[aã]o autorizado/.test(t)) return "Sem procuração/autorização para esta empresa.";
  if (/sem d[eé]bito|zerada/.test(t)) return "Sem débito a pagar na competência.";
  return "Não foi possível gerar a guia.";
}

/** Competência anterior e dia de hoje, no fuso de Brasília. */
export function agoraBrasilia(base = new Date()) {
  const br = new Date(base.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const prev = new Date(br.getFullYear(), br.getMonth() - 1, 1);
  return {
    competenciaAnterior: `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`,
    diaHoje: br.getDate(),
  };
}
