import { NextResponse } from "next/server";
import { hasWriteKey, lancarInformeRendimentos } from "@/lib/questor";
import { prepararInforme, ErroInforme } from "@/lib/informe-rendimentos-servico";
import { jaLancado, registrarLog } from "@/lib/informe-rendimentos-log";
import { exigirContabil } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Grava no Questor. O regime é lido de novo aqui, no servidor: o navegador só
 * confirma ("confirmar: true") e a chave (idempotência) impede lançar duas
 * vezes o mesmo informe.
 */
export async function POST(req: Request) {
  const email = await exigirContabil();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Contábil." }, { status: 403 });

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (corpo.confirmar !== true) {
    return NextResponse.json({ error: "Confirmação ausente: nada foi gravado." }, { status: 400 });
  }
  if (!hasWriteKey()) {
    return NextResponse.json({ error: "QUESTOR_WRITE_KEY não configurada no servidor." }, { status: 412 });
  }

  try {
    const p = await prepararInforme(corpo);
    if (!p.gravacaoLiberada) return NextResponse.json({ error: p.motivoBloqueio }, { status: 423 });

    const anterior = await jaLancado(p.chave).catch(() => null);
    if (anterior) {
      return NextResponse.json(
        { error: `Este informe já foi lançado em ${new Date(anterior.criado_em).toLocaleString("pt-BR")} por ${anterior.responsavel}.` },
        { status: 409 }
      );
    }

    const r = await lancarInformeRendimentos(p.plano, { dryRun: false, idempotencyKey: p.chave, usuario: email });
    if (!r.ok) {
      const msg = r.status === 404
        ? "A API do Questor ainda não tem o endpoint de informe de rendimentos. Nada foi gravado."
        : `O Questor recusou o lançamento (HTTP ${r.status}): ${r.corpo.detail ?? r.corpo.erro ?? "sem detalhe"}`;
      await registrarLog({ entrada: p.entrada, plano: p.plano, nomeEmpresa: p.nomeEmpresa, status: "erro", responsavel: email, chave: p.chave, resposta: r.corpo, erro: msg });
      return NextResponse.json({ error: msg }, { status: r.status === 404 ? 501 : 502 });
    }

    await registrarLog({ entrada: p.entrada, plano: p.plano, nomeEmpresa: p.nomeEmpresa, status: "lancado", responsavel: email, chave: p.chave, resposta: r.corpo });
    return NextResponse.json({ ok: true, repetido: r.corpo.repetido === true, ecf: r.corpo.ecf, f100: r.corpo.f100, avisos: r.corpo.avisos ?? [] });
  } catch (e) {
    if (e instanceof ErroInforme) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[informe-rendimentos/lancar]", e);
    return NextResponse.json({ error: "Falha ao lançar o informe." }, { status: 500 });
  }
}
