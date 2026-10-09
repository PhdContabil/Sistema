import { NextResponse } from "next/server";
import { ajustarLucroDistribuido, hasWriteKey } from "@/lib/questor";
import { prepararAjuste, ErroLucro } from "@/lib/lucros-distribuidos-servico";
import { chaveAjuste, registrarLog } from "@/lib/lucros-distribuidos-log";
import { exigirContabil } from "../../informe-rendimentos/_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Altera um lançamento existente (competência, data, valores, isenção). Com
 * "confirmar" ausente, só simula na API do Questor (dry run).
 */
export async function POST(req: Request) {
  const email = await exigirContabil();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Contábil." }, { status: 403 });

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const gravar = corpo.confirmar === true;
  if (!hasWriteKey()) return NextResponse.json({ error: "QUESTOR_WRITE_KEY não configurada no servidor." }, { status: 412 });

  try {
    const p = await prepararAjuste(corpo);
    const e = p.plano.entrada;
    const chave = chaveAjuste(e, e.chave);
    const r = await ajustarLucroDistribuido(p.plano, { dryRun: !gravar, idempotencyKey: gravar ? chave : `${chave}:dry`, usuario: email });

    const msgErro = r.ok ? null : r.status === 404
      ? "Lançamento não encontrado no Questor, ou a API ainda não tem o endpoint de ajuste. Nada foi alterado."
      : `O Questor recusou o ajuste (HTTP ${r.status}): ${r.corpo.detail ?? r.corpo.erro ?? "sem detalhe"}`;

    if (gravar) {
      await registrarLog({
        operacao: "ajuste", entrada: e, nomeEmpresa: p.nomeEmpresa, nomeSocio: p.nomeSocio, responsavel: email, chave,
        status: r.ok ? "lancado" : "erro", chaveQuestor: e.chave, resposta: r.corpo, erro: msgErro,
      });
    }
    if (!r.ok) return NextResponse.json({ error: msgErro }, { status: r.status === 404 ? 501 : 502 });
    return NextResponse.json({ ok: true, gravado: gravar, plano: p.plano, avisos: r.corpo.avisos ?? [] });
  } catch (e) {
    if (e instanceof ErroLucro) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[lucros-distribuidos/ajustar]", e);
    return NextResponse.json({ error: "Falha ao ajustar o lançamento." }, { status: 500 });
  }
}
