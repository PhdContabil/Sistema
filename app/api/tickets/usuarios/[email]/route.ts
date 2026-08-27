import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { salvarUsuario, removerUsuario, podeEditarMedicao } from "@/lib/tickets";

export const dynamic = "force-dynamic";

async function contexto() {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase() ?? null;
  if (!email) return { email: null, ok: false };
  return { email, ok: await podeEditarMedicao(email) };
}

export async function PUT(req: Request, { params }: { params: { email: string } }) {
  const { ok } = await contexto();
  if (!ok) return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });

  let body: { name?: string; sector?: string; is_sub_admin?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  const erro = await salvarUsuario({
    email: decodeURIComponent(params.email),
    name: body.name ?? "",
    sector: body.sector ?? "",
    is_sub_admin: !!body.is_sub_admin,
  });
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { email: string } }) {
  const { email: meu, ok } = await contexto();
  if (!ok) return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });

  const alvo = decodeURIComponent(params.email).toLowerCase();
  if (alvo === meu) return NextResponse.json({ error: "Você não pode remover a si mesmo." }, { status: 400 });

  const erro = await removerUsuario(alvo);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
