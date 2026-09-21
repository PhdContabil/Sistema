import { NextResponse } from "next/server";
import {
  obterSprint, atualizarSprint, excluirSprint,
  listarItens, listarCapacidade, listarFolgas, backlogDisponivel, ehData, ehEstado,
} from "@/lib/sprints";
import { exigirTI } from "../_auth";

export const dynamic = "force-dynamic";

/** Tudo que a tela precisa numa chamada só: sprint, itens, capacidade e backlog. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const email = await exigirTI();
  if (!email) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });

  const sprint = await obterSprint(params.id);
  if (!sprint) return NextResponse.json({ error: "Sprint não encontrada." }, { status: 404 });

  const [itens, capacidade, folgas, backlog] = await Promise.all([
    listarItens(params.id),
    listarCapacidade(params.id),
    listarFolgas(params.id),
    backlogDisponivel(),
  ]);
  return NextResponse.json({ sprint, itens, capacidade, folgas, backlog });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const email = await exigirTI();
  if (!email) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });

  let body: { nome?: string; inicio?: string; fim?: string; estado?: string; objetivo?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  const campos: Record<string, unknown> = {};
  if (body.nome !== undefined) {
    const n = body.nome.trim();
    if (!n) return NextResponse.json({ error: "O nome não pode ficar vazio." }, { status: 400 });
    campos.nome = n;
  }
  if (body.inicio !== undefined) {
    if (!ehData(body.inicio)) return NextResponse.json({ error: "Início inválido." }, { status: 400 });
    campos.inicio = body.inicio;
  }
  if (body.fim !== undefined) {
    if (!ehData(body.fim)) return NextResponse.json({ error: "Fim inválido." }, { status: 400 });
    campos.fim = body.fim;
  }
  if (body.estado !== undefined) {
    if (!ehEstado(body.estado)) return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
    campos.estado = body.estado;
  }
  if (body.objetivo !== undefined) campos.objetivo = body.objetivo || null;

  const erro = await atualizarSprint(params.id, campos);
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const email = await exigirTI();
  if (!email) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  const erro = await excluirSprint(params.id);
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });
  return NextResponse.json({ ok: true });
}
