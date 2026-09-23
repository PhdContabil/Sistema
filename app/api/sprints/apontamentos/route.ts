import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { ehDaTI } from "@/lib/tickets";
import { lancarHoras, apagarApontamento, ehData, horaValida } from "@/lib/sprints";

export const dynamic = "force-dynamic";

/** Aceita só múltiplos de meia hora, de 0,5 a 24. */
function horas(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n > 24) return null;
  return horaValida(n) ? n : null;
}

/**
 * Lança horas no cartão. Vale para quem executa, não só para o TI — mas
 * sempre em nome de quem está logado: o corpo não escolhe o autor.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: { ticket_id?: string; sprint_id?: string | null; data?: string; horas?: unknown; comentario?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  if (!body.ticket_id) return NextResponse.json({ error: "Cartão não informado." }, { status: 400 });
  if (!ehData(body.data)) return NextResponse.json({ error: "Data inválida." }, { status: 400 });

  const h = horas(body.horas);
  if (h === null) {
    return NextResponse.json(
      { error: "O apontamento vai de 30 em 30 minutos: 0,5 · 1 · 1,5 · 2… até 24 h." },
      { status: 400 }
    );
  }

  const erro = await lancarHoras(body.ticket_id, body.sprint_id ?? null, email, {
    data: body.data,
    horas: h,
    comentario: (body.comentario ?? "").trim() || null,
  });
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Lançamento não informado." }, { status: 400 });

  const erro = await apagarApontamento(id, email, await ehDaTI(email));
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
