import { NextResponse } from "next/server";
import { hasWriteKey, lancarLucroDistribuido } from "@/lib/questor";
import { prepararLancamento, ErroLucro } from "@/lib/lucros-distribuidos-servico";
import { chaveLancamento, jaLancado, registrarLog } from "@/lib/lucros-distribuidos-log";
import { notificarLucro } from "@/lib/notificar-lucro";
import { exigirContabil } from "../../informe-rendimentos/_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Grava no Questor. O navegador só confirma ("confirmar: true"). */
export async function POST(req: Request) {
  const email = await exigirContabil();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Contábil." }, { status: 403 });

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (corpo.confirmar !== true) return NextResponse.json({ error: "Confirmação ausente: nada foi gravado." }, { status: 400 });
  if (!hasWriteKey()) return NextResponse.json({ error: "QUESTOR_WRITE_KEY não configurada no servidor." }, { status: 412 });

  try {
    const p = await prepararLancamento(corpo);
    const e = p.plano.entrada;
    const chave = chaveLancamento(e);

    const anterior = await jaLancado(chave).catch(() => null);
    if (anterior) {
      return NextResponse.json(
        { error: `Esta distribuição já foi lançada em ${new Date(anterior.criado_em).toLocaleString("pt-BR")} por ${anterior.responsavel}.` },
        { status: 409 }
      );
    }

    const base = { operacao: "lancamento" as const, entrada: e, nomeEmpresa: p.nomeEmpresa, nomeSocio: p.nomeSocio, responsavel: email, chave };
    const r = await lancarLucroDistribuido(p.plano, { dryRun: false, idempotencyKey: chave, usuario: email });
    if (!r.ok) {
      const msg = r.status === 404
        ? "A API do Questor ainda não tem o endpoint de lucros distribuídos. Nada foi gravado."
        : `O Questor recusou o lançamento (HTTP ${r.status}): ${r.corpo.detail ?? r.corpo.erro ?? "sem detalhe"}`;
      await registrarLog({ ...base, status: "erro", resposta: r.corpo, erro: msg });
      return NextResponse.json({ error: msg }, { status: r.status === 404 ? 501 : 502 });
    }

    await registrarLog({ ...base, status: "lancado", chaveQuestor: r.corpo.chave ?? null, resposta: r.corpo });
    const repetido = r.corpo.repetido === true;
    // Aviso no Teams só para lançamento novo; reenvio idempotente não avisa de novo.
    const notificacao = repetido ? "desligada" : await notificarLucro({
      evento: "novo", competencia: e.competencia, codigoempresa: e.codigoempresa, nomeEmpresa: p.nomeEmpresa,
      nomeSocio: p.nomeSocio, codigosocio: e.codigosocio, rendimento: e.rendimento, imposto: e.imposto,
    }, email);
    return NextResponse.json({ ok: true, repetido, chave: r.corpo.chave ?? null, avisos: r.corpo.avisos ?? [], notificacao });
  } catch (e) {
    if (e instanceof ErroLucro) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[lucros-distribuidos/lancar]", e);
    return NextResponse.json({ error: "Falha ao lançar a distribuição." }, { status: 500 });
  }
}
