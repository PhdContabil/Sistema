import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { ticketsDb } from "@/lib/tickets";

// Abre um chamado na T.I. quando o robô do Sistema MEI falha por motivo técnico
// (mudança no portal, seletor, erro do sistema). Autor = quem está logado;
// já fica atribuído ao Pedro (tecnologia@phdcontabil.com.br) com o log e o print do robô.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RESPONSAVEL = "tecnologia@phdcontabil.com.br";
const BUCKET = "ticket-anexos";

export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const db = ticketsDb();
  if (!db) return NextResponse.json({ error: "Banco de tickets não configurado." }, { status: 500 });

  let b: { contexto?: string; erro?: string; passos?: string[]; print?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const contexto = String(b.contexto ?? "Robô do Sistema MEI").slice(0, 300);
  const erro = String(b.erro ?? "").slice(0, 2000);
  const passos = (b.passos ?? []).slice(-15).map((p) => `- ${String(p).slice(0, 300)}`).join("\n");
  const nome = (user?.user_metadata?.full_name as string | undefined) ?? (user?.user_metadata?.name as string | undefined) ?? null;

  const descricao = [
    `**Robô do Sistema MEI falhou** (chamado aberto pela tela do sistema).`,
    ``, `**O que estava fazendo:** ${contexto}`,
    ``, `**Erro:**`, "```", erro || "(sem mensagem)", "```",
    ``, `**Log do robô (últimos passos):**`, passos || "- (sem passos)",
    ``, `Aberto por: ${nome ?? email} · ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
  ].join("\n");

  const { data: t, error } = await db.from("tickets").insert({
    title: `Robô MEI: ${contexto}`.slice(0, 150), description: descricao, sector: "mei", priority: "alta",
    status: "backlog", created_by_email: email, created_by_name: nome,
  }).select("id").maybeSingle();
  if (error || !t) return NextResponse.json({ error: error?.message ?? "Falha ao criar o chamado." }, { status: 500 });

  const { data: p } = await db.from("ticket_users").select("name").ilike("email", RESPONSAVEL).maybeSingle();
  await db.from("ticket_assignees").upsert({ ticket_id: t.id, user_email: RESPONSAVEL, user_name: p?.name ?? "Pedro" }, { onConflict: "ticket_id,user_email" });

  // Print da tela do robô no momento do erro (se veio)
  if (b.print && b.print.length < 8_000_000) {
    try {
      const path = `${t.id}/robo-${Date.now()}.jpg`;
      const up = await db.storage.from(BUCKET).upload(path, Buffer.from(b.print, "base64"), { contentType: "image/jpeg", upsert: false });
      if (!up.error) {
        const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path);
        await db.from("ticket_attachments").insert({ ticket_id: t.id, url: pub.publicUrl, filename: "print-robo.jpg", uploaded_by_email: email });
      }
    } catch { /* chamado já criado; o print é opcional */ }
  }
  return NextResponse.json({ ok: true, id: t.id });
}
