import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico da integração com o Microsoft Graph (presença do Teams).
 * Não expõe segredos — apenas diz em qual etapa a integração está.
 *
 * Etapas verificadas:
 *   1. variáveis de ambiente presentes
 *   2. obtenção do token de aplicação (client credentials)
 *   3. leitura de usuários (User.Read.All)
 *   4. leitura de presença (Presence.Read.All)
 */
export async function GET(req: Request) {
  const tenant = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const secret = process.env.MS_CLIENT_SECRET;
  const { searchParams } = new URL(req.url);
  const emailTeste = searchParams.get("email");

  const etapas: Record<string, unknown> = {};

  etapas["1_variaveis"] = {
    MS_TENANT_ID: Boolean(tenant),
    MS_CLIENT_ID: Boolean(clientId),
    MS_CLIENT_SECRET: Boolean(secret),
  };
  if (!tenant || !clientId || !secret) {
    return NextResponse.json({ ok: false, etapas, conclusao: "Credenciais não configuradas na Vercel." });
  }

  // 1) Token
  let token = "";
  try {
    const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId, client_secret: secret,
        scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
      }),
      cache: "no-store",
    });
    const j = await r.json();
    if (!r.ok) {
      etapas["2_token"] = { ok: false, status: r.status, erro: j?.error, descricao: String(j?.error_description ?? "").split("\n")[0] };
      return NextResponse.json({ ok: false, etapas, conclusao: "Falha ao obter token — confira tenant, client id e secret." });
    }
    token = j.access_token;
    // decodifica as permissões concedidas (payload do JWT, sem validar assinatura)
    let roles: string[] = [];
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8"));
      roles = payload.roles ?? [];
    } catch { /* ignora */ }
    etapas["2_token"] = { ok: true, permissoes_concedidas: roles, tem_presence: roles.includes("Presence.Read.All") };
  } catch (e) {
    etapas["2_token"] = { ok: false, erro: e instanceof Error ? e.message : "erro" };
    return NextResponse.json({ ok: false, etapas, conclusao: "Não foi possível contatar o login da Microsoft." });
  }

  // 2) Usuários
  let userId = "";
  try {
    const url = emailTeste
      ? `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(emailTeste)}?$select=id,displayName,mail,userPrincipalName`
      : `https://graph.microsoft.com/v1.0/users?$top=3&$select=id,displayName,mail,userPrincipalName`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const j = await r.json();
    if (!r.ok) {
      etapas["3_usuarios"] = { ok: false, status: r.status, erro: j?.error?.code, mensagem: j?.error?.message };
    } else if (emailTeste) {
      userId = j?.id ?? "";
      etapas["3_usuarios"] = { ok: true, encontrado: { nome: j?.displayName, mail: j?.mail ?? j?.userPrincipalName } };
    } else {
      const lista = (j?.value ?? []).map((u: Record<string, string>) => ({ nome: u.displayName, mail: u.mail ?? u.userPrincipalName }));
      userId = j?.value?.[0]?.id ?? "";
      etapas["3_usuarios"] = { ok: true, total_amostra: lista.length, exemplos: lista };
    }
  } catch (e) {
    etapas["3_usuarios"] = { ok: false, erro: e instanceof Error ? e.message : "erro" };
  }

  // 3) Presença
  if (userId) {
    try {
      const r = await fetch("https://graph.microsoft.com/v1.0/communications/getPresencesByUserId", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [userId] }),
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) {
        etapas["4_presenca"] = { ok: false, status: r.status, erro: j?.error?.code, mensagem: j?.error?.message };
      } else {
        const p = j?.value?.[0];
        etapas["4_presenca"] = { ok: true, availability: p?.availability, activity: p?.activity };
      }
    } catch (e) {
      etapas["4_presenca"] = { ok: false, erro: e instanceof Error ? e.message : "erro" };
    }
  } else {
    etapas["4_presenca"] = { ok: false, motivo: "sem usuário para testar (etapa 3 falhou)" };
  }

  const p4 = etapas["4_presenca"] as { ok?: boolean };
  return NextResponse.json({
    ok: Boolean(p4?.ok),
    etapas,
    conclusao: p4?.ok
      ? "Integração com o Teams funcionando."
      : "Token obtido, mas a leitura de presença falhou — verifique se a permissão de APLICAÇÃO Presence.Read.All foi concedida com consentimento do administrador.",
  });
}
