// Avisos por e-mail do Societário (pedido da Flávia, gerente do Paralegal, 27/10/2026):
//  - Flávia: processo de Abertura / Alteração / Cancelamento / Transformação registrado (inclui abrir a O.S.);
//  - Kelly (Integração): processo de Abertura ou Transformação;
//  - Corresponsável: quando passa a acompanhar uma atividade (coparticipação).
// Envia pelo Microsoft 365 de quem salvou. Em localhost (desenvolvimento) TUDO vai só para quem salvou, com [TESTE].
import { enviarEmail } from "@/lib/paralegal/graph";
import { listUsuarios } from "./usuarios";
import type { SocietalActivity } from "./tareffa";

const GERENTE = process.env.SOCIETARIO_EMAIL_GERENTE || "flavia@phdcontabil.com.br";
const INTEGRACAO = process.env.SOCIETARIO_EMAIL_INTEGRACAO || "kelly@phdcontabil.com.br";
const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://system-contabilidade.vercel.app";
const DEV = process.env.NODE_ENV !== "production";
const GERAL = process.env.SOCIETARIO_EMAIL_GERAL || "geral@phdcontabil.com.br";
/** URL do fluxo do Teams ("Quando uma solicitação de webhook do Teams for recebida" → publicar no chat/canal). */
const TEAMS_WEBHOOK = process.env.SOCIETARIO_TEAMS_WEBHOOK || "";

/** Cartão no Teams (Workflows). Em localhost, o título vai com [TESTE]. */
async function teams(titulo: string, texto: string, fatos: [string, string][], link: string, log: string[]): Promise<boolean> {
  if (!TEAMS_WEBHOOK) return false;
  const card = {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4",
        body: [
          { type: "TextBlock", size: "Medium", weight: "Bolder", text: (DEV ? "[TESTE] " : "") + titulo, wrap: true },
          { type: "TextBlock", text: texto, wrap: true },
          { type: "FactSet", facts: fatos.filter(([, v]) => v).map(([title, value]) => ({ title, value })) },
        ],
        actions: [{ type: "Action.OpenUrl", title: "Abrir no Núcleo", url: link }],
      },
    }],
  };
  try {
    const r = await fetch(TEAMS_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(card) });
    log.push(r.ok ? `Teams: "${titulo}"` : `Teams recusou (HTTP ${r.status})`);
    return r.ok;
  } catch (e) {
    log.push(`falha no Teams: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

const norm = (s: string | null | undefined) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** E-mail de um responsável pelo nome (ex.: "JULIA HELENA") — cadastro de Usuários do Societário. */
async function emailDe(nome: string | null | undefined): Promise<string | null> {
  const alvo = norm(nome);
  if (!alvo || alvo === "STANDBY") return null;
  const us = (await listUsuarios().catch(() => [])).filter((u) => u.active);
  const partes = alvo.split(" ");
  const u = us.find((x) => norm(x.name) === alvo)
    ?? us.find((x) => partes.every((p) => norm(x.name).includes(p)))
    ?? us.find((x) => norm(x.name).split(" ")[0] === partes[0] && partes.length === 1);
  return u?.email ?? null;
}

interface ProcessoAviso {
  id: number;
  name: string;
  inscription?: string;
  process: string;
  bearer?: string | null;
  started_in?: string;
  category?: string;
  activities: SocietalActivity[];
}

function resumo(p: ProcessoAviso): string {
  const ativs = p.activities.map((a) =>
    `<li>${esc(a.name)}${a.responsible ? ` — ${esc(a.responsible)}` : ""}${a.co_responsible ? ` (corresp.: ${esc(a.co_responsible)})` : ""}${a.deadline_in ? ` · prazo ${esc(a.deadline_in.slice(0, 10).split("-").reverse().join("/"))}` : ""}</li>`).join("");
  return `<p><b>Empresa:</b> ${esc(p.name)}${p.inscription ? ` (${esc(p.inscription)})` : ""}<br>`
    + `<b>Processo:</b> ${esc(p.process)}<br><b>Responsável:</b> ${esc(p.bearer || "—")}<br>`
    + `<b>Início:</b> ${esc((p.started_in || "").split("-").reverse().join("/"))}</p>`
    + (p.category ? `<p><b>Observações:</b> ${esc(p.category)}</p>` : "")
    + (ativs ? `<p><b>Atividades:</b></p><ul>${ativs}</ul>` : "")
    + `<p><a href="${BASE}/m/societario/processos/${p.id}">Abrir o processo no Núcleo</a></p>`;
}

async function enviar(remetente: string, para: string[], assunto: string, html: string, log: string[]) {
  const dest = [...new Set(para.filter(Boolean).map((e) => e.toLowerCase()))];
  if (!dest.length) return;
  const real = DEV ? [remetente] : dest;
  const titulo = DEV ? `[TESTE → ${dest.join(", ")}] ${assunto}` : assunto;
  try {
    await enviarEmail({ remetente, para: real, assunto: titulo, corpoHtml: html, anexos: [] });
    log.push(`e-mail "${assunto}" para ${dest.join(", ")}${DEV ? " (teste: enviado só para você)" : ""}`);
  } catch (e) {
    log.push(`falha ao enviar "${assunto}": ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Avisos ao CRIAR um processo. */
export async function avisarProcessoNovo(p: ProcessoAviso, remetente: string, opts: { comunicarSetores?: boolean } = {}): Promise<string[]> {
  const log: string[] = [];
  const t = norm(p.process);
  const ehAbertura = /ABERTURA|TRANSFORMA/.test(t);
  const paraGerente = /ABERTURA|ALTERA|CANCELA|TRANSFORMA/.test(t);
  const titulo = `${p.process} — ${p.name}`;
  if (paraGerente) {
    // Flávia: pelo Teams (fluxo de trabalho); se o fluxo não estiver configurado, por e-mail.
    const foi = await teams(`Novo processo: ${titulo}`, "Processo registrado no Societário. Se ainda não houver, abrir a O.S.",
      [["Empresa", p.name], ["CNPJ/CPF", p.inscription || ""], ["Processo", p.process], ["Responsável", p.bearer || ""],
       ["Início", (p.started_in || "").split("-").reverse().join("/")], ["Atividades", String(p.activities.length)]],
      `${BASE}/m/societario/processos/${p.id}`, log);
    if (!foi) {
      await enviar(remetente, [GERENTE], `Novo processo: ${titulo}`,
        `<p>Olá, Flávia!</p><p>Foi registrado um novo processo no Societário. Se ainda não houver, é preciso abrir a O.S.</p>${resumo(p)}`, log);
    }
  }
  if (/CANCELA/.test(t) && opts.comunicarSetores !== false) log.push(...(await comunicarCancelamento(p, remetente)));
  if (ehAbertura) {
    await enviar(remetente, [INTEGRACAO], `Integração — novo processo: ${titulo}`,
      `<p>Olá, Kelly!</p><p>Novo processo de ${esc(p.process)} registrado, para acompanhamento da Integração.</p>${resumo(p)}`, log);
  }
  log.push(...(await avisarCorresponsaveis(p, [], remetente)));
  return log;
}

/** Avisa quem passou a ser corresponsável (compara com as atividades de antes). */
export async function avisarCorresponsaveis(p: ProcessoAviso, antes: SocietalActivity[], remetente: string): Promise<string[]> {
  const log: string[] = [];
  const jaEra = new Set(antes.map((a) => `${norm(a.name)}|${norm(a.co_responsible)}`));
  const porPessoa = new Map<string, SocietalActivity[]>();
  for (const a of p.activities) {
    if (!a.co_responsible || jaEra.has(`${norm(a.name)}|${norm(a.co_responsible)}`)) continue;
    const k = norm(a.co_responsible);
    if (!porPessoa.has(k)) porPessoa.set(k, []);
    porPessoa.get(k)!.push(a);
  }
  for (const [, ativs] of porPessoa) {
    const nome = ativs[0].co_responsible!;
    const email = await emailDe(nome);
    if (!email) { log.push(`sem e-mail cadastrado para ${nome} (Usuários do Societário)`); continue; }
    const lista = ativs.map((a) => `<li>${esc(a.name)}${a.responsible ? ` — responsável: ${esc(a.responsible)}` : ""}${a.deadline_in ? ` · prazo ${esc(a.deadline_in.slice(0, 10).split("-").reverse().join("/"))}` : ""}</li>`).join("");
    await enviar(remetente, [email], `Coparticipação: ${p.process} — ${p.name}`,
      `<p>Olá!</p><p>Você foi incluído(a) como <b>corresponsável</b> e vai acompanhar a parte interna destas atividades:</p><ul>${lista}</ul>${resumo(p)}`, log);
  }
  return log;
}

/** Cancelamento: comunica os setores (geral@) que a empresa está entrando em processo de cancelamento. */
export async function comunicarCancelamento(p: ProcessoAviso, remetente: string): Promise<string[]> {
  const log: string[] = [];
  await enviar(remetente, [GERAL], `Comunicado: ${p.name} em processo de cancelamento`,
    `<p>Prezados(as),</p><p>Comunicamos que a empresa abaixo está entrando em <b>processo de cancelamento</b>. `
    + `Pedimos que cada setor verifique as pendências e providências da sua área.</p>`
    + `<p><b>Empresa:</b> ${esc(p.name)}${p.inscription ? ` (${esc(p.inscription)})` : ""}<br><b>Responsável no Paralegal:</b> ${esc(p.bearer || "—")}<br>`
    + `<b>Início do processo:</b> ${esc((p.started_in || "").split("-").reverse().join("/"))}</p>`, log);
  return log;
}
