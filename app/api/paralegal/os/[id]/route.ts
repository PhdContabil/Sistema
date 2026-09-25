import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { obterOS, atualizarOS, excluirOS, type OS } from "@/lib/paralegal/os";
import { GraphErro } from "@/lib/paralegal/graph";

export const dynamic = "force-dynamic";

async function souAutorizado() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return podeAcessarApp(nivel, "paralegal", "Controle");
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });
  try {
    const item = await obterOS(params.id);
    return NextResponse.json({ item });
  } catch (e) {
    const status = e instanceof GraphErro ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao buscar." }, { status });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });

  let body: Partial<OS>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  try {
    await atualizarOS(params.id, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof GraphErro ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao atualizar." }, { status });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });
  try {
    await excluirOS(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof GraphErro ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao excluir." }, { status });
  }
}
