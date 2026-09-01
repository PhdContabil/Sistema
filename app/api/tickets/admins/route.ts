import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { listarAdmins, adicionarAdmin, removerAdmin, ehAdminNav } from "@/lib/tickets";

export const dynamic = "force-dynamic";

async function contexto() {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase() ?? null;
  if (!email) return { email: null, ok: false };
  return { email, ok: ehAdminNav(email) };
}

export async function GET() {
  const { ok } = await contexto();
  if (!ok) return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  return NextResponse.json({ admins: await listarAdmins() });
}

export async function POST(req: Request) {
  const { ok } = await contexto();
  if (!ok) return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });

  let body: { email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  const erro = await adicionarAdmin(body.email ?? "");
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { email: meu, ok } = await contexto();
  if (!ok) return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });

  const alvo = new URL(req.url).searchParams.get("email")?.toLowerCase();
  if (!alvo) return NextResponse.json({ error: "Informe o e-mail." }, { status: 400 });
  if (alvo === meu) return NextResponse.json({ error: "Você não pode remover a si mesmo." }, { status: 400 });

  const erro = await removerAdmin(alvo);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
