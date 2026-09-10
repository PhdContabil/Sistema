import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { ticketsDb, podeEditarMedicao } from "@/lib/tickets";

export const dynamic = "force-dynamic";

/** Edita o texto de um comentário — só quem escreveu. */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; comentarioId: string } }
) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const db = ticketsDb();
  if (!db) return NextResponse.json({ error: "Banco de tickets não configurado." }, { status: 500 });

  let body: { body?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const texto = (body.body ?? "").trim();
  if (!texto) return NextResponse.json({ error: "O comentário não pode ficar vazio." }, { status: 400 });

  const { data: atual } = await db
    .from("ticket_comments")
    .select("author_email")
    .eq("id", params.comentarioId)
    .maybeSingle();
  if (!atual) return NextResponse.json({ error: "Comentário não encontrado." }, { status: 404 });
  if ((atual as { author_email: string }).author_email.toLowerCase() !== email) {
    return NextResponse.json({ error: "Só quem escreveu pode editar o comentário." }, { status: 403 });
  }

  const { data, error } = await db
    .from("ticket_comments")
    .update({ body: texto })
    .eq("id", params.comentarioId)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, comentario: data });
}

/** Exclui um comentário — o autor, ou admin/sub-admin de Tickets. */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; comentarioId: string } }
) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const db = ticketsDb();
  if (!db) return NextResponse.json({ error: "Banco de tickets não configurado." }, { status: 500 });

  const { data: atual } = await db
    .from("ticket_comments")
    .select("author_email")
    .eq("id", params.comentarioId)
    .maybeSingle();
  if (!atual) return NextResponse.json({ error: "Comentário não encontrado." }, { status: 404 });

  const souAutor = (atual as { author_email: string }).author_email.toLowerCase() === email;
  if (!souAutor && !(await podeEditarMedicao(email))) {
    return NextResponse.json({ error: "Sem permissão pra excluir esse comentário." }, { status: 403 });
  }

  const { error } = await db.from("ticket_comments").delete().eq("id", params.comentarioId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
