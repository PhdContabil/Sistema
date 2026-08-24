import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { ticketsDb } from "@/lib/tickets";

export const dynamic = "force-dynamic";

/** Comenta em um ticket. O autor vem da sessão. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const db = ticketsDb();
  if (!db) return NextResponse.json({ error: "Banco de tickets não configurado." }, { status: 500 });

  let body: { body?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  const texto = (body.body ?? "").trim();
  if (!texto) return NextResponse.json({ error: "Escreva algo antes de enviar." }, { status: 400 });

  const nome = (user?.user_metadata?.full_name as string | undefined) ?? null;

  const { data, error } = await db
    .from("ticket_comments")
    .insert({ ticket_id: params.id, author_email: email, author_name: nome, body: texto })
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mantém o ticket no topo de "atualizados recentemente".
  await db.from("tickets").update({ updated_at: new Date().toISOString() }).eq("id", params.id);

  return NextResponse.json({ ok: true, comentario: data });
}
