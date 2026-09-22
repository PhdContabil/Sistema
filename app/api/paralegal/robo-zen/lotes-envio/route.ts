// POST { simulacaoId } — inicia o envio real em LOTE: cadastra de verdade
// no Questor Zen os documentos de TODAS as empresas PRONTA de uma
// simulação já concluída. Equivalente a /api/enviar-tudo-real do app
// Python. Irreversível — a confirmação na tela (checkbox + botão vermelho)
// é a mesma proteção que o Python usava; aqui não há um segundo passo de
// confirmação por token (como no envio de uma empresa só) porque não dá
// para mostrar a lista de centenas de documentos na tela antes.

import { NextResponse } from "next/server";
import { ehResposta, exigirAcessoParalegal } from "@/lib/robo-zen/guard";
import * as dbz from "@/lib/robo-zen/db";
import { serializarLoteEnvio } from "@/lib/robo-zen/job-lote-envio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await exigirAcessoParalegal();
  if (ehResposta(auth)) return auth;

  const corpo = await req.json().catch(() => ({}));
  const simulacaoId = typeof corpo?.simulacaoId === "string" ? corpo.simulacaoId : "";
  if (!simulacaoId) {
    return NextResponse.json({ ok: false, erro: "simulacaoId é obrigatório." }, { status: 400 });
  }

  const simulacao = await dbz.obterSimulacao(simulacaoId);
  if (!simulacao) {
    return NextResponse.json({ ok: false, erro: "Simulação de origem não encontrada." }, { status: 404 });
  }
  if (simulacao.status !== "concluida") {
    return NextResponse.json(
      { ok: false, erro: "A simulação de origem precisa estar concluída antes de enviar de verdade." },
      { status: 409 }
    );
  }

  const [loteAtivo, simulacaoAtiva] = await Promise.all([dbz.obterLoteEnvioAtivo(), dbz.obterSimulacaoAtiva()]);
  if (loteAtivo) {
    return NextResponse.json({ ok: false, erro: "Já tem um envio em lote rodando." }, { status: 409 });
  }
  if (simulacaoAtiva) {
    return NextResponse.json(
      {
        ok: false,
        erro: "Tem uma simulação completa rodando agora — espere terminar (as duas mexem nas mesmas pastas).",
      },
      { status: 409 }
    );
  }

  const empresasProntas = await dbz.listarEmpresasProntas(simulacaoId);
  const lote = await dbz.criarLoteEnvio(auth.email, simulacaoId, empresasProntas.length);
  return NextResponse.json({ ok: true, lote: serializarLoteEnvio(lote) }, { status: 201 });
}
