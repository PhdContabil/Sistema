import { NextResponse } from "next/server";
import { obterCredenciaisMS, tokenGraph } from "@/lib/pessoas/msconfig";

export const dynamic = "force-dynamic";

// cache curto dos ids (email -> id do Entra), evita re-resolver a cada 60s
let cacheIds: { mapa: Record<string, string>; em: number } | null = null;
const TTL_IDS = 30 * 60 * 1000;

export async function POST(req: Request) {
  const c = await obterCredenciaisMS();
  if (c.origem === "ausente") {
    return NextResponse.json({ presenca: {}, configurado: false });
  }

  let emails: string[] = [];
  try {
    const body = await req.json();
    emails = Array.isArray(body?.emails)
      ? body.emails.filter(Boolean).map((e: string) => e.toLowerCase()).slice(0, 650)
      : [];
  } catch {
    emails = [];
  }
  if (emails.length === 0) return NextResponse.json({ presenca: {}, configurado: true });

  const token = await tokenGraph(c);
  if (!token) return NextResponse.json({ presenca: {}, configurado: true, erro: "token" });

  try {
    // ids (com cache)
    let idPorEmail: Record<string, string> = {};
    if (cacheIds && Date.now() - cacheIds.em < TTL_IDS) {
      idPorEmail = cacheIds.mapa;
    }
    const faltando = emails.filter((e) => !idPorEmail[e]);
    if (faltando.length > 0) {
      const novos: Record<string, string> = { ...idPorEmail };
      await Promise.all(
        faltando.map(async (mail) => {
          const r = await fetch(
            `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mail)}?$select=id`,
            { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
          );
          if (r.ok) {
            const u = await r.json();
            if (u?.id) novos[mail] = u.id;
          }
        })
      );
      idPorEmail = novos;
      cacheIds = { mapa: novos, em: Date.now() };
    }

    const emailPorId: Record<string, string> = {};
    for (const mail of emails) {
      const id = idPorEmail[mail];
      if (id) emailPorId[id] = mail;
    }
    const ids = Object.keys(emailPorId);
    if (ids.length === 0) return NextResponse.json({ presenca: {}, configurado: true });

    const pr = await fetch("https://graph.microsoft.com/v1.0/communications/getPresencesByUserId", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
      cache: "no-store",
    });
    if (!pr.ok) {
      return NextResponse.json({ presenca: {}, configurado: true, erro: `graph ${pr.status}` });
    }
    const dados = await pr.json();

    const presenca: Record<string, string> = {};
    for (const item of dados?.value ?? []) {
      const mail = emailPorId[item.id];
      if (mail) presenca[mail] = String(item.availability ?? "unknown").toLowerCase();
    }
    return NextResponse.json({ presenca, configurado: true, origem: c.origem });
  } catch (e) {
    return NextResponse.json({ presenca: {}, configurado: true, erro: e instanceof Error ? e.message : "erro" });
  }
}
