// DCTFWeb sem movimento + EFD-Reinf R-2099. Regras puras (sem rede/banco), testáveis.
//
// Regra do escritório: teve movimento em M-1 e não tem em M -> entregar a sem
// movimento em M (R-2099 com tudo "N" + DCTFWeb). Depois disso a empresa fica
// "sem movimento desde M" e só volta para a fila quando aparecer movimento.

export const NS_R2099 = "http://www.reinf.esocial.gov.br/schemas/evtFechamento/v2_01_02";
export const NS_LOTE = "http://www.reinf.esocial.gov.br/schemas/envioLoteEventosAssincrono/v1_00_00";

export type AmbienteReinf = 1 | 2; // 1 produção, 2 produção restrita (teste)
export const URL_REINF: Record<AmbienteReinf, string> = {
  1: "https://reinf.receita.economia.gov.br",
  2: "https://pre-reinf.receita.economia.gov.br",
};

export const raiz = (cnpj: string) => cnpj.replace(/\D/g, "").slice(0, 8);

/** Competência anterior de 'AAAA-MM'. */
export function competenciaAnterior(c: string) {
  const [a, m] = c.split("-").map(Number);
  const d = new Date(a, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const teveMovimento = (debito: number | string | null | undefined) => Number(debito) > 0;

export interface LinhaMov { cnpj: string; razao_social: string | null; codigoempresa: number | null; debito: number | string | null }

/**
 * Quem entra em "sem movimento" na competência e quem saiu dela.
 * - candidatos: movimento em M-1, nada em M, e ainda não marcada como sem movimento.
 * - voltaram: marcadas como sem movimento que voltaram a ter movimento em M.
 */
export function apurar(anterior: LinhaMov[], atual: LinhaMov[], semMovimento: Set<string>) {
  const movAtual = new Set(atual.filter((l) => teveMovimento(l.debito)).map((l) => raiz(l.cnpj)));
  const vistos = new Set<string>();
  const candidatos: (LinhaMov & { debito_anterior: number })[] = [];
  for (const l of anterior) {
    const r = raiz(l.cnpj);
    if (!teveMovimento(l.debito) || movAtual.has(r) || semMovimento.has(r) || vistos.has(r)) continue;
    vistos.add(r);
    candidatos.push({ ...l, debito: 0, debito_anterior: Number(l.debito) });
  }
  const voltaram = [...semMovimento].filter((r) => movAtual.has(r));
  return { candidatos, voltaram };
}

/** Id do evento Reinf: "ID" + tpInsc + nrInsc(14, zeros à direita) + AAAAMMDDHHMMSS + seq(5). */
export function idEvento(cnpj: string, agora = new Date(), seq = 1) {
  const p = (n: number, t = 2) => String(n).padStart(t, "0");
  const ts = `${agora.getUTCFullYear()}${p(agora.getUTCMonth() + 1)}${p(agora.getUTCDate())}`
    + `${p(agora.getUTCHours())}${p(agora.getUTCMinutes())}${p(agora.getUTCSeconds())}`;
  return `ID1${raiz(cnpj).padEnd(14, "0")}${ts}${p(seq, 5)}`;
}

/** R-2099 sem movimento: todos os indicadores "N". */
export function xmlR2099(p: { id: string; cnpj: string; competencia: string; ambiente: AmbienteReinf }) {
  if (!/^\d{4}-\d{2}$/.test(p.competencia)) throw new Error("Competência inválida.");
  return `<Reinf xmlns="${NS_R2099}"><evtFechaEvPer id="${p.id}">`
    + `<ideEvento><perApur>${p.competencia}</perApur><tpAmb>${p.ambiente}</tpAmb><procEmi>1</procEmi><verProc>Nucleo-1.0</verProc></ideEvento>`
    + `<ideContri><tpInsc>1</tpInsc><nrInsc>${raiz(p.cnpj)}</nrInsc></ideContri>`
    + `<infoFech><evtServTm>N</evtServTm><evtServPr>N</evtServPr><evtAssDespRec>N</evtAssDespRec>`
    + `<evtAssDespRep>N</evtAssDespRep><evtComProd>N</evtComProd><evtCPRB>N</evtCPRB><evtAquis>N</evtAquis></infoFech>`
    + `</evtFechaEvPer></Reinf>`;
}

/** Lote assíncrono com um evento já assinado. */
export function xmlLote(cnpj: string, id: string, eventoAssinado: string) {
  const ev = eventoAssinado.replace(/^<\?xml[^>]*\?>\s*/, "");
  return `<Reinf xmlns="${NS_LOTE}"><envioLoteEventos><ideContribuinte><tpInsc>1</tpInsc><nrInsc>${raiz(cnpj)}</nrInsc></ideContribuinte>`
    + `<eventos><evento Id="${id}">${ev}</evento></eventos></envioLoteEventos></Reinf>`;
}

const tag = (xml: string, nome: string) => xml.match(new RegExp(`<(?:\\w+:)?${nome}>([^<]*)</(?:\\w+:)?${nome}>`))?.[1]?.trim() ?? null;
const todas = (xml: string, nome: string) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${nome}>([^<]*)</(?:\\w+:)?${nome}>`, "g"))].map((m) => m[1].trim());

/** Resposta do envio: protocolo ou ocorrências do lote. */
export function lerEnvio(xml: string) {
  const cd = tag(xml, "cdResposta");
  return { protocolo: tag(xml, "protocoloEnvio"), cdResposta: cd, mensagem: [tag(xml, "descResposta"), ...todas(xml, "dscResp")].filter(Boolean).join(" | ") };
}

export type EstadoR2099 = "processando" | "aceito" | "rejeitado";

/**
 * Resultado da consulta do lote. cdResposta 1 = em processamento; no evento,
 * cdRetorno 0 = sucesso (com nrRecArqBase) e 1 = erro. "Já existe fechamento"
 * conta como aceito: o período já está fechado na Receita.
 */
export function lerConsulta(xml: string): { estado: EstadoR2099; recibo: string | null; mensagem: string } {
  const cdLote = tag(xml, "cdResposta");
  const mensagem = [...todas(xml, "dscResp"), ...todas(xml, "descRetorno"), tag(xml, "descResposta")].filter(Boolean).join(" | ");
  if (cdLote === "1" || (!xml.includes("cdRetorno") && /processamento/i.test(xml))) return { estado: "processando", recibo: null, mensagem };
  const recibo = tag(xml, "nrRecArqBase") ?? tag(xml, "nrProtEntr");
  if (tag(xml, "cdRetorno") === "0" || recibo) return { estado: "aceito", recibo, mensagem };
  if (/j[aá]\s+(existe|foi\s+(enviado|transmitido))\s+.*fechamento|per[ií]odo\s+j[aá]\s+(est[aá]\s+)?fechado/i.test(mensagem)) return { estado: "aceito", recibo: null, mensagem };
  return { estado: "rejeitado", recibo: null, mensagem: mensagem || "Rejeitado pela Receita." };
}
