import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { ticketsDb, ehSetor, ehPrioridade } from "@/lib/tickets";

export const dynamic = "force-dynamic";

/** Cria um ticket. O autor vem da sessão — nunca do corpo da requisição. */
export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const db = ticketsDb();
  if (!db) return NextResponse.json({ error: "Banco de tickets não configurado." }, { status: 500 });

  let body: { title?: string; description?: string; sector?: string; priority?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Informe o título." }, { status: 400 });
  if (!ehSetor(body.sector)) return NextResponse.json({ error: "Setor inválido." }, { status: 400 });

  const priority = ehPrioridade(body.priority) ? body.priority : "media";
  const nome = (user?.user_metadata?.full_name as string | undefined) ?? (user?.user_metadata?.name as string | undefined) ?? null;

  const { data, error } = await db
    .from("tickets")
    .insert({
      title,
      description: (body.description ?? "").trim(),
      sector: body.sector,
      priority,
      status: "backlog",
      created_by_email: email,
      created_by_name: nome,
    })
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}
