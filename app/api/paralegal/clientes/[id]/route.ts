import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { obterCliente, atualizarCliente, excluirCliente, type Cliente } from "@/lib/paralegal/clientes";
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
    const cliente = await obterCliente(params.id);
    return NextResponse.json({ cliente });
  } catch (e) {
    const status = e instanceof GraphErro ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao buscar cliente." }, { status });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });

  let body: Partial<Cliente>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  if (body.nome !== undefined && !body.nome.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  }

  try {
    await atualizarCliente(params.id, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof GraphErro ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao atualizar cliente." }, { status });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });
  try {
    await excluirCliente(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof GraphErro ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao excluir cliente." }, { status });
  }
}
