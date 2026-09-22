// POST: avança UM pedaço da simulação (uma pasta de 1º nível na fase de
// mapeamento, ou uma empresa na fase de processamento) e devolve o estado
// atualizado. O navegador chama isto repetidamente (polling, a cada
// ~1500ms — mesma cadência do app original) até `concluida=true`. Ver
// lib/robo-zen/job-simulacao.ts para a lógica em si.

import { NextResponse } from "next/server";
import { ehResposta, exigirAcessoParalegal } from "@/lib/robo-zen/guard";
import { avancarSimulacao } from "@/lib/robo-zen/job-simulacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await exigirAcessoParalegal();
  if (ehResposta(auth)) return auth;

  try {
    const estado = await avancarSimulacao(params.id);
    return NextResponse.json({ ok: true, simulacao: estado });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    const status = mensagem.includes("não encontrada") ? 404 : 500;
    return NextResponse.json({ ok: false, erro: mensagem }, { status });
  }
}
