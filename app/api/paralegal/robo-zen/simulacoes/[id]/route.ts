// GET: estado atual de uma simulação — sem avançar nada (equivalente a
// /api/status do app Python). Usado tanto pelo polling quanto para
// recarregar o progresso depois de um refresh de página.

import { NextResponse } from "next/server";
import { ehResposta, exigirAcessoParalegal } from "@/lib/robo-zen/guard";
import * as dbz from "@/lib/robo-zen/db";
import { serializarSimulacao } from "@/lib/robo-zen/job-simulacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await exigirAcessoParalegal();
  if (ehResposta(auth)) return auth;

  const simulacao = await dbz.obterSimulacao(params.id);
  if (!simulacao) {
    return NextResponse.json({ ok: false, erro: "Simulação não encontrada." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, simulacao: serializarSimulacao(simulacao) });
}
