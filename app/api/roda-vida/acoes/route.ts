import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { adicionarAcao, marcarAcao, removerAcao, donoDaRoda } from "@/lib/roda-vida";

export const dynamic = "force-dynamic";

async function donoConfere(rodaId: string, email: string): Promise<boolean> {
  const dono = await donoDaRoda(rodaId);
  return !!dono && dono.toLowerCase() === email;
}

export async function POST(req: Request) {
  const u = await getCurrentUser().catch(() => null);
  const email = u?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: { roda_id?: string; dimensao?: string; acao?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!body.roda_id || !body.dimensao || !body.acao) {
    return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
  }
  if (!(await donoConfere(body.roda_id, email))) {
    return NextResponse.json({ error: "Essa roda não é sua." }, { status: 403 });
  }

  const erro = await adicionarAcao(body.roda_id, body.dimensao, body.acao);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const u = await getCurrentUser().catch(() => null);
  const email = u?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: { roda_id?: string; id?: string; feita?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!body.roda_id || !body.id) return NextResponse.json({ error: "Ação não informada." }, { status: 400 });
  if (!(await donoConfere(body.roda_id, email))) {
    return NextResponse.json({ error: "Essa roda não é sua." }, { status: 403 });
  }

  const erro = await marcarAcao(body.id, !!body.feita);
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const u = await getCurrentUser().catch(() => null);
  const email = u?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const rodaId = url.searchParams.get("roda_id");
  if (!id || !rodaId) return NextResponse.json({ error: "Ação não informada." }, { status: 400 });
  if (!(await donoConfere(rodaId, email))) {
    return NextResponse.json({ error: "Essa roda não é sua." }, { status: 403 });
  }

  const erro = await removerAcao(id);
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });
  return NextResponse.json({ ok: true });
}
