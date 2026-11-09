import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { ehDaTI } from "@/lib/tickets";
import { obterPedido, salvarPedido, executarPedido, validarEntrada, lerAprovadores, type EntradaPedido } from "@/lib/tarefas-dp";

async function podeAprovar(email: string | null): Promise<boolean> {
  if (!email) return false;
  if (await ehDaTI(email)) return true;
  return (await lerAprovadores()).includes(email);
}

export const dynamic = "force-dynamic";

async function quem() {
  const u = await getCurrentUser().catch(() => null);
  return u?.email?.toLowerCase() ?? null;
}

/** Pedido "Incluir tarefa" do ticket. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const email = await quem();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json({ pedido: await obterPedido(params.id), podeAprovar: await podeAprovar(email) });
}

/** Grava/atualiza o pedido (quem abriu o ticket ou TI). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const email = await quem();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as EntradaPedido | null;
  if (!body) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const erro = validarEntrada(body);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  try {
    return NextResponse.json({ pedido: await salvarPedido(params.id, body, email) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }
}

/** { acao: "simular" | "gerar" } — só TI. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const email = await quem();
  if (!(await podeAprovar(email))) return NextResponse.json({ error: "Você não está liberado para aprovar tarefas do Tareffa." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { acao?: string };
  const simular = body.acao !== "gerar";
  try {
    return NextResponse.json({ pedido: await executarPedido(params.id, simular, email!) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
