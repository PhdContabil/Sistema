import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso } from "@/lib/acesso";
import { lerAprovadores, definirAprovador } from "@/lib/tarefas-dp";

export const dynamic = "force-dynamic";

async function autorizado() {
  const user = await getCurrentUser().catch(() => null);
  return (await obterNivelAcesso(user?.email)).acessoTotal;
}

/** Lista de e-mails que aprovam tarefas do Tareffa (além da T.I.). */
export async function GET() {
  if (!(await autorizado())) return NextResponse.json({ error: "Apenas T.I. e Diretoria." }, { status: 403 });
  return NextResponse.json({ aprovadores: await lerAprovadores() });
}

/** { email, aprova } */
export async function PUT(req: Request) {
  if (!(await autorizado())) return NextResponse.json({ error: "Apenas T.I. e Diretoria." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { email?: string; aprova?: boolean };
  if (!b.email) return NextResponse.json({ error: "Informe o e-mail." }, { status: 400 });
  try {
    return NextResponse.json({ aprovadores: await definirAprovador(b.email, !!b.aprova) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}