import { NextResponse } from "next/server";
import { hasWriteKey, lancarInformeRendimentos } from "@/lib/questor";
import { prepararInforme, ErroInforme } from "@/lib/informe-rendimentos-servico";
import { jaLancado } from "@/lib/informe-rendimentos-log";
import { exigirContabil } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Simulação (dry run): descobre o regime no Tareffa, monta as linhas e, se a
 * API do Questor já tiver o endpoint, pede a ela a validação. NÃO grava nada.
 */
export async function POST(req: Request) {
  const email = await exigirContabil();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Contábil." }, { status: 403 });

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  try {
    const p = await prepararInforme(corpo);

    let questor: { disponivel: boolean; motivo?: string; avisos?: string[]; ecf?: unknown[]; f100?: unknown[] };
    if (!hasWriteKey()) {
      questor = { disponivel: false, motivo: "QUESTOR_WRITE_KEY não configurada no servidor." };
    } else {
      try {
        const r = await lancarInformeRendimentos(p.plano, { dryRun: true, idempotencyKey: `${p.chave}:dry`, usuario: email });
        questor = r.ok
          ? { disponivel: true, avisos: r.corpo.avisos, ecf: r.corpo.ecf, f100: r.corpo.f100 }
          : {
              disponivel: false,
              motivo: r.status === 404
                ? "A API do Questor ainda não tem o endpoint de informe de rendimentos."
                : `A API do Questor recusou a simulação (HTTP ${r.status}): ${r.corpo.detail ?? r.corpo.erro ?? "sem detalhe"}`,
            };
      } catch (e) {
        questor = { disponivel: false, motivo: e instanceof Error ? e.message : "API do Questor indisponível." };
      }
    }

    const anterior = await jaLancado(p.chave).catch(() => null);
    return NextResponse.json({
      regime: p.regime,
      regimeDescricao: p.regimeDescricao,
      nomeEmpresa: p.nomeEmpresa,
      plano: p.plano,
      chave: p.chave,
      gravacaoLiberada: p.gravacaoLiberada && questor.disponivel,
      motivoBloqueio: p.motivoBloqueio ?? (questor.disponivel ? null : questor.motivo ?? null),
      jaLancadoEm: anterior?.criado_em ?? null,
      questor,
    });
  } catch (e) {
    if (e instanceof ErroInforme) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[informe-rendimentos/calcular]", e);
    return NextResponse.json({ error: "Falha ao calcular o informe." }, { status: 500 });
  }
}
