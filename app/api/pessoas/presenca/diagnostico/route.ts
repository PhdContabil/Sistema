import { NextResponse } from "next/server";
import { obterCredenciaisMS, tokenGraph } from "@/lib/pessoas/msconfig";

export const dynamic = "force-dynamic";

/** Diagnóstico da integração com o Microsoft Graph. Não expõe segredos. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  const etapas: Record<string, unknown> = {};

  const c = await obterCredenciaisMS();
  etapas["1_credenciais"] = {
    origem: c.origem,
    service_role_disponivel: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
  if (c.origem === "ausente") {
    return NextResponse.json({ ok: false, etapas, conclusao: "Credenciais não encontradas (env nem banco)." });
  }

  const token = await tokenGraph(c);
  if (!token) {
    etapas["2_token"] = { ok: false };
    return NextResponse.json({ ok: false, etapas, conclusao: "Falha ao obter token." });
  }
  let roles: string[] = [];
  try {
    roles = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8")).roles ?? [];
  } catch { /* ignora */ }
  etapas["2_token"] = { ok: true, permissoes: roles };

  const alvo = email ?? "junior@phdcontabil.com.br";
  const r1 = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(alvo)}?$select=id,displayName,mail`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );
  const j1 = await r1.json();
  if (!r1.ok) {
    etapas["3_usuario"] = { ok: false, status: r1.status, erro: j1?.error?.code };
    return NextResponse.json({ ok: false, etapas, conclusao: "Sem permissão para ler usuários." });
  }
  etapas["3_usuario"] = { ok: true, nome: j1?.displayName, mail: j1?.mail };

  const r2 = await fetch("https://graph.microsoft.com/v1.0/communications/getPresencesByUserId", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ids: [j1.id] }),
    cache: "no-store",
  });
  const j2 = await r2.json();
  if (!r2.ok) {
    etapas["4_presenca"] = { ok: false, status: r2.status, erro: j2?.error?.code };
    return NextResponse.json({ ok: false, etapas, conclusao: "Sem permissão de presença." });
  }
  etapas["4_presenca"] = { ok: true, availability: j2?.value?.[0]?.availability, activity: j2?.value?.[0]?.activity };

  return NextResponse.json({ ok: true, etapas, conclusao: "Integração com o Teams funcionando." });
}
