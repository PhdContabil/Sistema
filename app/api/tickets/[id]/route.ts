import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { ticketsDb, detalheTicket, ehStatus, ehPrioridade } from "@/lib/tickets";

export const dynamic = "force-dynamic";

/** Detalhe completo do ticket: comentários, anexos e responsáveis. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const d = await detalheTicket(params.id);
  if (!d) return NextResponse.json({ error: "Ticket não encontrado." }, { status: 404 });
  return NextResponse.json(d);
}

/** Atualiza status, prioridade ou responsáveis. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const db = ticketsDb();
  if (!db) return NextResponse.json({ error: "Banco de tickets não configurado." }, { status: 500 });

  let body: {
    status?: string; priority?: string; title?: string; description?: string;
    assumir?: boolean; remover?: boolean;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!ehStatus(body.status)) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    patch.status = body.status;
  }
  if (body.priority !== undefined) {
    if (!ehPrioridade(body.priority)) return NextResponse.json({ error: "Prioridade inválida." }, { status: 400 });
    patch.priority = body.priority;
  }
  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "O título não pode ficar vazio." }, { status: 400 });
    patch.title = t;
  }
  if (typeof body.description === "string") patch.description = body.description.trim();

  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString();
    const { error } = await db.from("tickets").update(patch).eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Atribuição: cada um assume ou larga o próprio ticket.
  if (body.assumir) {
    const nome = (user?.user_metadata?.full_name as string | undefined) ?? null;
    const { error } = await db
      .from("ticket_assignees")
      .upsert({ ticket_id: params.id, user_email: email, user_name: nome },
              { onConflict: "ticket_id,user_email" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (body.remover) {
    const { error } = await db
      .from("ticket_assignees").delete()
      .eq("ticket_id", params.id).eq("user_email", email);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
