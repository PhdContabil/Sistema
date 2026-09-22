import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { salvarNota, donoDaRoda } from "@/lib/roda-vida";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const u = await getCurrentUser().catch(() => null);
  const email = u?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: { roda_id?: string; dimensao?: string; nota?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!body.roda_id || !body.dimensao) {
    return NextResponse.json({ error: "Roda ou dimensão não informada." }, { status: 400 });
  }

  const dono = await donoDaRoda(body.roda_id);
  if (!dono || dono.toLowerCase() !== email) {
    return NextResponse.json({ error: "Essa roda não é sua." }, { status: 403 });
  }

  const nota = Number(body.nota);
  const erro = await salvarNota(body.roda_id, body.dimensao, nota);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
