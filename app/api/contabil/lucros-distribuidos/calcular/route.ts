import { NextResponse } from "next/server";
import { hasWriteKey, lancarLucroDistribuido } from "@/lib/questor";
import { prepararLancamento, ErroLucro } from "@/lib/lucros-distribuidos-servico";
import { chaveLancamento, jaLancado } from "@/lib/lucros-distribuidos-log";
import { exigirContabil } from "../../informe-rendimentos/_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Simulação (dry run): monta as linhas e, se a API do Questor já tiver o
 * endpoint, pede a ela a validação. NÃO grava nada.
 */
export async function POST(req: Request) {
  const email = await exigirContabil();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Contábil." }, { status: 403 });

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  try {
    const p = await prepararLancamento(corpo);
    const chave = chaveLancamento(p.plano.entrada);

    let questor: { disponivel: boolean; motivo?: string; avisos?: string[] };
    if (!hasWriteKey()) {
      questor = { disponivel: false, motivo: "QUESTOR_WRITE_KEY não configurada no servidor." };
    } else {
      try {
        const r = await lancarLucroDistribuido(p.plano, { dryRun: true, idempotencyKey: `${chave}:dry`, usuario: email });
        questor = r.ok
          ? { disponivel: true, avisos: r.corpo.avisos }
          : {
              disponivel: false,
              motivo: r.status === 404
                ? "A API do Questor ainda não tem o endpoint de lucros distribuídos."
                : `A API do Questor recusou a simulação (HTTP ${r.status}): ${r.corpo.detail ?? r.corpo.erro ?? "sem detalhe"}`,
            };
      } catch (e) {
        questor = { disponivel: false, motivo: e instanceof Error ? e.message : "API do Questor indisponível." };
      }
    }

    const anterior = await jaLancado(chave).catch(() => null);
    return NextResponse.json({
      plano: p.plano, nomeEmpresa: p.nomeEmpresa, nomeSocio: p.nomeSocio, chave,
      gravacaoLiberada: questor.disponivel,
      motivoBloqueio: questor.disponivel ? null : questor.motivo ?? null,
      jaLancadoEm: anterior?.criado_em ?? null,
      questor,
    });
  } catch (e) {
    if (e instanceof ErroLucro) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[lucros-distribuidos/calcular]", e);
    return NextResponse.json({ error: "Falha ao calcular a distribuição." }, { status: 500 });
  }
}
