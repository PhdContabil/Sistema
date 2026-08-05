// Notificações do fluxo de férias: e-mail e Teams (Microsoft Graph).
//
// IMPORTANTE (limitação da Microsoft): um aplicativo NÃO pode enviar mensagem
// privada de chat no Teams em modo aplicativo — isso só existe em nome de um
// usuário logado. O que funciona app-only é:
//   • E-mail            -> Graph /users/{remetente}/sendMail   (permissão Mail.Send)
//   • Aviso no Teams    -> Graph /users/{id}/teamwork/sendActivityNotification
//                          (permissão TeamsActivity.Send)
//   • Canal do Teams    -> Incoming Webhook (variável TEAMS_WEBHOOK_URL)
//
// Cada canal é opcional: o que não estiver configurado é ignorado sem quebrar o fluxo.
import { createClient } from "@supabase/supabase-js";
import { obterCredenciaisMS, tokenGraph } from "./msconfig";

const REMETENTE = process.env.MS_REMETENTE || "tecnologia@phdcontabil.com.br";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svc) return null;
  return createClient(url, svc, { auth: { persistSession: false } });
}

async function registrar(destino: string, canal: string, assunto: string, sucesso: boolean, detalhe?: string) {
  const sb = admin();
  if (!sb) return;
  try {
    await sb.from("notificacoes_log").insert({ destino, canal, assunto, sucesso, detalhe: detalhe ?? null });
  } catch { /* log é acessório */ }
}

/** Envia e-mail via Microsoft Graph (app-only). */
export async function enviarEmail(para: string, assunto: string, html: string): Promise<boolean> {
  const c = await obterCredenciaisMS();
  if (c.origem === "ausente") { await registrar(para, "email", assunto, false, "credenciais ausentes"); return false; }
  const token = await tokenGraph(c);
  if (!token) { await registrar(para, "email", assunto, false, "sem token"); return false; }

  try {
    const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(REMETENTE)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: assunto,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: para } }],
        },
        saveToSentItems: true,
      }),
      cache: "no-store",
    });
    const ok = r.ok;
    await registrar(para, "email", assunto, ok, ok ? undefined : `HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
    return ok;
  } catch (e) {
    await registrar(para, "email", assunto, false, e instanceof Error ? e.message : "erro");
    return false;
  }
}

/**
 * Aviso na central de atividades do Teams.
 *
 * TESTADO EM 05/08/2026: o Graph devolve 403 —
 *   "Application ... is not authorized to generate custom text notifications".
 * Ou seja: mesmo com a permissão TeamsActivity.Send concedida, a Microsoft exige
 * que o aviso seja atribuído a um APP DO TEAMS instalado no tenant. Enquanto esse
 * app não existir, esta função falha silenciosamente (fica registrada no log) e a
 * notificação segue por e-mail + canal do Teams (webhook).
 *
 * Para ativar de verdade: publicar um app do Teams (manifest) e instalá-lo para os
 * usuários, ou usar um fluxo do Power Automate que envie a mensagem no chat.
 */
export async function avisarTeams(paraEmail: string, texto: string, link: string): Promise<boolean> {
  if (process.env.TEAMS_ATIVIDADE_ATIVA !== "1") return false; // desligado até existir o app do Teams
  const c = await obterCredenciaisMS();
  if (c.origem === "ausente") return false;
  const token = await tokenGraph(c);
  if (!token) return false;

  try {
    // resolve o id do usuário
    const ru = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(paraEmail)}?$select=id`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!ru.ok) { await registrar(paraEmail, "teams", texto, false, `usuário ${ru.status}`); return false; }
    const { id } = await ru.json();

    const r = await fetch(`https://graph.microsoft.com/v1.0/users/${id}/teamwork/sendActivityNotification`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: { source: "text", value: "Núcleo Contábil — Férias", webUrl: link },
        activityType: "taskCreated",
        previewText: { content: texto },
        templateParameters: [{ name: "taskName", value: texto }],
      }),
      cache: "no-store",
    });
    const ok = r.ok;
    await registrar(paraEmail, "teams", texto, ok, ok ? undefined : `HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
    return ok;
  } catch (e) {
    await registrar(paraEmail, "teams", texto, false, e instanceof Error ? e.message : "erro");
    return false;
  }
}

/** Lê uma configuração do banco (app_config), com cache simples. */
const cacheCfg = new Map<string, { valor: string | null; em: number }>();
async function config(chave: string): Promise<string | null> {
  const doEnv = process.env[chave];
  if (doEnv) return doEnv;

  const c = cacheCfg.get(chave);
  if (c && Date.now() - c.em < 5 * 60 * 1000) return c.valor;

  const sb = admin();
  if (!sb) return null;
  try {
    const { data } = await sb.from("app_config").select("valor").eq("chave", chave).maybeSingle();
    const valor = data?.valor ?? null;
    cacheCfg.set(chave, { valor, em: Date.now() });
    return valor;
  } catch {
    return null;
  }
}

/**
 * Mensagem PRIVADA no Teams via Power Automate.
 *
 * O Graph não deixa um app enviar chat 1:1 (403). O Power Automate consegue
 * porque envia como "Flow bot". Então o sistema chama um fluxo com gatilho
 * "Quando uma solicitação HTTP é recebida" e o fluxo posta no Teams.
 *
 * Configure a URL do gatilho em POWER_AUTOMATE_URL (env) ou na tabela app_config.
 * Payload enviado:
 *   { "para": "email@phdcontabil.com.br", "titulo": "...", "mensagem": "...", "link": "..." }
 */
export async function avisarTeamsFluxo(
  paraEmail: string,
  titulo: string,
  mensagem: string,
  link: string
): Promise<boolean> {
  const url = await config("POWER_AUTOMATE_URL");
  if (!url) return false;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ para: paraEmail, titulo, mensagem, link }),
      cache: "no-store",
    });
    const ok = r.ok;
    await registrar(paraEmail, "teams", titulo, ok, ok ? "via Power Automate" : `HTTP ${r.status}`);
    return ok;
  } catch (e) {
    await registrar(paraEmail, "teams", titulo, false, e instanceof Error ? e.message : "erro");
    return false;
  }
}

/**
 * Mensagem no Teams SEM licença premium — via e-mail de controle.
 *
 * Como o gatilho HTTP do Power Automate é premium, usamos conectores padrão:
 *   1. O sistema envia um e-mail de controle para a caixa da Tecnologia
 *      (assunto padronizado com o destinatário).
 *   2. Um fluxo "Quando um novo e-mail chegar" lê esse e-mail e dispara
 *      "Postar mensagem em um chat" para a pessoa, como Flow bot.
 *
 * Assunto: [NC-TEAMS] para=fulano@phdcontabil.com.br | Título
 * Corpo:   mensagem + link (texto simples, fácil de repassar no fluxo)
 */
export async function avisarTeamsPorEmail(
  paraEmail: string,
  titulo: string,
  mensagem: string,
  link: string
): Promise<boolean> {
  const caixa = (await config("TEAMS_RELAY_EMAIL")) || "tecnologia@phdcontabil.com.br";

  const assunto = `[NC-TEAMS] para=${paraEmail} | ${titulo}`;
  const corpo = `
    <p><strong>DESTINATARIO:</strong> ${paraEmail}</p>
    <p><strong>TITULO:</strong> ${titulo}</p>
    <p><strong>MENSAGEM:</strong> ${mensagem}</p>
    <p><strong>LINK:</strong> ${link}</p>
    <hr>
    <p style="font-size:12px;color:#68717e">
      E-mail de controle do Núcleo Contábil. Um fluxo do Power Automate lê esta
      mensagem e a entrega no Teams do destinatário. Não é necessário responder.
    </p>`;

  const ok = await enviarEmail(caixa, assunto, corpo);
  await registrar(paraEmail, "teams", `relay: ${titulo}`, ok, ok ? `via caixa ${caixa}` : "falha no relay");
  return ok;
}

/**
 * Aviso em canal do Teams via Incoming Webhook.
 * Caminho que funciona sem app do Teams: basta criar o webhook no canal
 * e guardar a URL em TEAMS_WEBHOOK_URL (env) ou em app_config.
 */
export async function avisarCanal(texto: string): Promise<boolean> {
  let url = process.env.TEAMS_WEBHOOK_URL;

  if (!url) {
    const sb = admin();
    if (sb) {
      try {
        const { data } = await sb.from("app_config").select("valor").eq("chave", "TEAMS_WEBHOOK_URL").maybeSingle();
        url = data?.valor ?? undefined;
      } catch { /* segue sem webhook */ }
    }
  }
  if (!url) return false;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: texto }),
      cache: "no-store",
    });
    await registrar("canal-teams", "teams", texto.slice(0, 120), r.ok, r.ok ? undefined : `HTTP ${r.status}`);
    return r.ok;
  } catch (e) {
    await registrar("canal-teams", "teams", texto.slice(0, 120), false, e instanceof Error ? e.message : "erro");
    return false;
  }
}

/**
 * Envia a notificação do Teams pelo melhor caminho disponível, nesta ordem:
 *   1. Power Automate com gatilho HTTP  (POWER_AUTOMATE_URL) — exige licença premium
 *   2. E-mail de controle + fluxo padrão (TEAMS_RELAY = "1")  — funciona no plano gratuito
 *   3. Central de atividades do Graph    (TEAMS_ATIVIDADE_ATIVA = "1") — exige app do Teams
 */
export async function notificarTeams(
  paraEmail: string,
  titulo: string,
  mensagem: string,
  link: string
): Promise<boolean> {
  if (await avisarTeamsFluxo(paraEmail, titulo, mensagem, link)) return true;

  const relay = (await config("TEAMS_RELAY")) ?? "1"; // ligado por padrão
  if (relay === "1" && (await avisarTeamsPorEmail(paraEmail, titulo, mensagem, link))) return true;

  return avisarTeams(paraEmail, `${titulo}: ${mensagem}`, link);
}

/** Modelo de e-mail simples com a identidade do sistema. */
export function layoutEmail(titulo: string, corpo: string, botao?: { texto: string; url: string }) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f4f6f8;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e9ef;border-radius:14px;padding:26px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
        <span style="display:inline-block;width:30px;height:30px;border-radius:8px;background:#2f6bde;color:#fff;text-align:center;line-height:30px;font-weight:700">N</span>
        <strong style="font-size:15px">Núcleo Contábil — PHD</strong>
      </div>
      <h2 style="margin:0 0 12px;font-size:18px;color:#151922">${titulo}</h2>
      <div style="font-size:14px;line-height:1.6;color:#3a4150">${corpo}</div>
      ${botao ? `<p style="margin:22px 0 0"><a href="${botao.url}" style="background:#2f6bde;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;display:inline-block">${botao.texto}</a></p>` : ""}
      <p style="margin:22px 0 0;font-size:12px;color:#68717e">Mensagem automática do Núcleo Contábil.</p>
    </div>
  </div>`;
}
