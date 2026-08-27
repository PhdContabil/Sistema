import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { listarPessoas, salvarUsuario, podeEditarMedicao } from "@/lib/tickets";

export const dynamic = "force-dynamic";

async function souAdmin() {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return false;
  return podeEditarMedicao(email);
}

export async function GET() {
  if (!(await souAdmin())) return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  return NextResponse.json({ usuarios: await listarPessoas() });
}

export async function POST(req: Request) {
  if (!(await souAdmin())) return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });

  let body: { email?: string; name?: string; sector?: string; is_sub_admin?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  const erro = await salvarUsuario({
    email: body.email ?? "",
    name: body.name ?? "",
    sector: body.sector ?? "",
    is_sub_admin: !!body.is_sub_admin,
  });
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
