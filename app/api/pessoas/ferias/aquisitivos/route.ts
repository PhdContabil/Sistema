import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { papelDe, salvarAquisitivo, excluirAquisitivo } from "@/lib/pessoas/ferias-programacao";

export const dynamic = "force-dynamic";

async function papel() {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  return email ? papelDe(email) : null;
}

/** Márcio cadastra/atualiza período aquisitivo e data limite. */
export async function POST(req: Request) {
  const p = await papel();
  if (!p) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  let b: { pessoa_id?: number; inicio_aquisitivo?: string; fim_aquisitivo?: string; limite_gozo?: string; saldo?: number; observacao?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!b.pessoa_id) return NextResponse.json({ error: "Escolha a pessoa." }, { status: 400 });
  const erro = await salvarAquisitivo(p, {
    pessoa_id: Number(b.pessoa_id), inicio_aquisitivo: b.inicio_aquisitivo ?? "", fim_aquisitivo: b.fim_aquisitivo ?? "",
    limite_gozo: b.limite_gozo ?? null, saldo: b.saldo ?? null, observacao: b.observacao ?? null,
  });
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const p = await papel();
  if (!p) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Informe o id." }, { status: 400 });
  const erro = await excluirAquisitivo(p, id);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
