// POST: pede para parar uma simulação em andamento (equivalente a
// /api/parar). Só marca o pedido — quem efetivamente para é a próxima
// chamada a /continuar (ver lib/robo-zen/job-simulacao.ts), já que não há
// uma thread rodando sozinha para checar uma flag em memória.

import { NextResponse } from "next/server";
import { ehResposta, exigirAcessoParalegal } from "@/lib/robo-zen/guard";
import * as dbz from "@/lib/robo-zen/db";
import { serializarSimulacao } from "@/lib/robo-zen/job-simulacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await exigirAcessoParalegal();
  if (ehResposta(auth)) return auth;

  const simulacao = await dbz.obterSimulacao(params.id);
  if (!simulacao) {
    return NextResponse.json({ ok: false, erro: "Simulação não encontrada." }, { status: 404 });
  }
  if (simulacao.status !== "mapeando" && simulacao.status !== "processando") {
    return NextResponse.json({ ok: false, erro: "Não tem simulação rodando." }, { status: 409 });
  }

  const atualizada = await dbz.atualizarSimulacao(params.id, { parar_pedido: true });
  return NextResponse.json({ ok: true, simulacao: serializarSimulacao(atualizada) });
}
