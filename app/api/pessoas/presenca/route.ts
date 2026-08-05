import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Presença do Teams via Microsoft Graph.
 *
 * Requer (Environment Variables na Vercel):
 *   MS_TENANT_ID       — ID do diretório (tenant) do Azure AD da PHD
 *   MS_CLIENT_ID       — Application (client) ID do app registrado
 *   MS_CLIENT_SECRET   — segredo do app
 * Permissão de aplicação necessária: Presence.Read.All (com consentimento do admin).
 *
 * Sem as credenciais, devolve {} e a interface simplesmente não mostra o indicador.
 */
export async function POST(req: Request) {
  const tenant = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const secret = process.env.MS_CLIENT_SECRET;

  if (!tenant || !clientId || !secret) {
    return NextResponse.json({ presenca: {}, configurado: false });
  }

  let emails: string[] = [];
  try {
    const body = await req.json();
    emails = Array.isArray(body?.emails) ? body.emails.filter(Boolean).slice(0, 650) : [];
  } catch {
    emails = [];
  }
  if (emails.length === 0) return NextResponse.json({ presenca: {}, configurado: true });

  try {
    // 1) token de aplicação (client credentials)
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: secret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
      cache: "no-store",
    });
    if (!tokenRes.ok) throw new Error(`token ${tokenRes.status}`);
    const { access_token } = await tokenRes.json();

    // 2) resolve e-mails -> ids de usuário
    const ids: Record<string, string> = {};
    await Promise.all(
      emails.map(async (mail) => {
        const r = await fetch(
          `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mail)}?$select=id,mail`,
          { headers: { Authorization: `Bearer ${access_token}` }, cache: "no-store" }
        );
        if (r.ok) {
          const u = await r.json();
          if (u?.id) ids[u.id] = mail.toLowerCase();
        }
      })
    );

    const listaIds = Object.keys(ids);
    if (listaIds.length === 0) return NextResponse.json({ presenca: {}, configurado: true });

    // 3) presença em lote (máx. 650 por chamada)
    const pr = await fetch("https://graph.microsoft.com/v1.0/communications/getPresencesByUserId", {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: listaIds }),
      cache: "no-store",
    });
    if (!pr.ok) throw new Error(`presence ${pr.status}`);
    const dados = await pr.json();

    const presenca: Record<string, string> = {};
    for (const item of dados?.value ?? []) {
      const mail = ids[item.id];
      if (mail) presenca[mail] = String(item.availability ?? "unknown").toLowerCase();
    }
    return NextResponse.json({ presenca, configurado: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ presenca: {}, configurado: true, erro: msg });
  }
}
