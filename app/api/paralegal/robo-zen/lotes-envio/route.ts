// POST { simulacaoId } — inicia o envio real em LOTE: cadastra de verdade
// no Questor Zen os documentos de TODAS as empresas PRONTA de uma
// simulação já concluída. Equivalente a /api/enviar-tudo-real do app
// Python. Irreversível — a confirmação na tela (checkbox + botão vermelho)
// é a mesma proteção que o Python usava; aqui não há um segundo passo de
// confirmação por token (como no envio de uma empresa só) porque não dá
// para mostrar a lista de centenas de documentos na tela antes.
//
// GET ?ativo=1 — o lote em andamento (ou null): é como a tela, ao abrir, reencontra
// um envio que ficou no meio (aba fechada, rede que caiu, outra pessoa) e continua.

import { NextResponse } from "next/server";
import { ehResposta, exigirAcessoParalegal } from "@/lib/robo-zen/guard";
import * as dbz from "@/lib/robo-zen/db";
import { serializarLoteEnvio } from "@/lib/robo-zen/job-lote-envio";
import { agruparPorEmpresa, aplicarSituacaoDeEnvio } from "@/lib/robo-zen/situacao-envio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = await exigirAcessoParalegal();
  if (ehResposta(auth)) return auth;

  const ativo = new URL(req.url).searchParams.get("ativo");
  if (!ativo) {
    return NextResponse.json({ ok: false, erro: "Use ?ativo=1." }, { status: 400 });
  }
  const lote = await dbz.obterLoteEnvioAtivo();
  return NextResponse.json({ ok: true, ativo: lote ? serializarLoteEnvio(lote) : null });
}

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

  // Nada a enviar? (todas as prontas já constam no registro de envios) Recusa na hora
  // — é o caso de alguém clicar no lote logo depois de outra pessoa ter terminado o
  // envio. Se o registro não puder ser lido, recusa também: na dúvida, não começa.
  try {
    const envios = agruparPorEmpresa(await dbz.todosOsEnvios());
    const agora = Date.now();
    const faltam = empresasProntas.filter(
      (e) =>
        aplicarSituacaoDeEnvio(
          {
            codigo: e.codigo,
            pronta: true,
            motivo: e.motivo ?? "",
            status: e.status ?? "",
            documentos: e.documentos_elegiveis.map((d) => d.nome),
          },
          envios.get(e.codigo) ?? [],
          [],
          agora
        ).pronta
    ).length;
    if (faltam === 0) {
      return NextResponse.json(
        {
          ok: false,
          erro:
            "Não tem nada a enviar: todas as empresas prontas dessa simulação já foram enviadas ao Zen " +
            "(constam no registro de envios).",
        },
        { status: 409 }
      );
    }
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        erro:
          `Não consegui conferir o registro de envios (${e instanceof Error ? e.message : String(e)}) — por ` +
          "segurança o envio em lote não começou. Tente de novo em instantes.",
      },
      { status: 503 }
    );
  }

  try {
    const lote = await dbz.criarLoteEnvio(auth.email, simulacaoId, empresasProntas.length);
    return NextResponse.json({ ok: true, lote: serializarLoteEnvio(lote) }, { status: 201 });
  } catch (e) {
    // Dois cliques ao mesmo tempo passam pela checagem acima; o banco só deixa um.
    if (e instanceof dbz.LoteJaAtivoError) {
      return NextResponse.json({ ok: false, erro: e.message }, { status: 409 });
    }
    throw e;
  }
}
