// POST: inicia uma nova simulação completa ("Rodar simulação completa" —
// só leitura, nunca envia nada ao Questor). Equivalente a /api/rodar-tudo
// do app Python, mas em vez de disparar uma thread que roda sozinha, só
// tira o "snapshot" das pastas de 1º nível (rápido) e devolve o id — quem
// avança o trabalho de verdade, aos pedaços, é o endpoint /continuar,
// chamado repetidamente pelo navegador (ver lib/robo-zen/job-simulacao.ts).
//
// GET ?ativa=1: devolve a simulação em andamento (se houver) — usado para
// retomar o polling depois de recarregar a página.

import { NextRequest, NextResponse } from "next/server";
import { ehResposta, exigirAcessoParalegal } from "@/lib/robo-zen/guard";
import { obterContextoGraph, listarPastasTopo, RoboZenSharePointErro } from "@/lib/robo-zen/empresas-sharepoint";
import * as dbz from "@/lib/robo-zen/db";
import { serializarSimulacao } from "@/lib/robo-zen/job-simulacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await exigirAcessoParalegal();
  if (ehResposta(auth)) return auth;

  const ativa = req.nextUrl.searchParams.get("ativa");
  if (ativa) {
    const simulacao = await dbz.obterSimulacaoAtiva();
    return NextResponse.json({ ok: true, ativa: simulacao ? serializarSimulacao(simulacao) : null });
  }

  const recentes = await dbz.listarSimulacoesRecentes(10);
  return NextResponse.json({ ok: true, simulacoes: recentes.map(serializarSimulacao) });
}

export async function POST() {
  const auth = await exigirAcessoParalegal();
  if (ehResposta(auth)) return auth;

  const [simulacaoAtiva, loteAtivo] = await Promise.all([dbz.obterSimulacaoAtiva(), dbz.obterLoteEnvioAtivo()]);
  if (simulacaoAtiva) {
    return NextResponse.json({ ok: false, erro: "Já tem uma simulação rodando." }, { status: 409 });
  }
  if (loteAtivo) {
    return NextResponse.json(
      {
        ok: false,
        erro: "Tem um envio real em lote rodando agora — espere terminar (as duas mexem nas mesmas pastas).",
      },
      { status: 409 }
    );
  }

  try {
    const ctx = await obterContextoGraph();
    const pastasTopo = await listarPastasTopo(ctx);
    const simulacao = await dbz.criarSimulacao(auth.email, pastasTopo);
    return NextResponse.json({ ok: true, simulacao: serializarSimulacao(simulacao) }, { status: 201 });
  } catch (e) {
    const status = e instanceof RoboZenSharePointErro ? e.status : 500;
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status });
  }
}
