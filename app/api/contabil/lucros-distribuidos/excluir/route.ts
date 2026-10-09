import { NextResponse } from "next/server";
import { excluirLucroDistribuido, hasWriteKey } from "@/lib/questor";
import { ErroLucro, resolverNomes } from "@/lib/lucros-distribuidos-servico";
import { chaveExclusao, marcarExcluido, registrarLog } from "@/lib/lucros-distribuidos-log";
import { ehData } from "@/lib/lucros-distribuidos";
import { exigirContabil } from "../../informe-rendimentos/_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Exclui um lançamento (fiscal + DP) no Questor e registra no log. */
export async function POST(req: Request) {
  const email = await exigirContabil();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Contábil." }, { status: 403 });

  let c: Record<string, unknown>;
  try { c = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (c.confirmar !== true) return NextResponse.json({ error: "Confirmação ausente: nada foi excluído." }, { status: 400 });
  if (!hasWriteKey()) return NextResponse.json({ error: "QUESTOR_WRITE_KEY não configurada no servidor." }, { status: 412 });

  const codigoempresa = Number(c.codigoempresa);
  const codigosocio = Number(c.codigosocio);
  const chaveQ = Number(c.chave);
  const dataAtual = String(c.dataAtual ?? "");
  const competencia = String(c.competencia ?? "");
  const rendimento = Number(c.rendimento ?? 0);
  if (![codigoempresa, codigosocio, chaveQ].every((n) => Number.isInteger(n) && n > 0) || !ehData(dataAtual)) {
    return NextResponse.json({ error: "Lançamento inválido." }, { status: 400 });
  }

  try {
    // Nomes só para o log: sócio que já saiu da empresa não impede a exclusão.
    const nomes = await resolverNomes(codigoempresa, codigosocio).catch(() => ({ nomeEmpresa: null, nomeSocio: null }));
    const chave = chaveExclusao(codigoempresa, chaveQ);
    const r = await excluirLucroDistribuido({ codigoempresa, chave: chaveQ, codigosocio, dataAtual }, { idempotencyKey: chave, usuario: email });
    const entrada = {
      codigoempresa, codigosocio, competencia: /^\d{4}-\d{2}/.test(competencia) ? competencia.slice(0, 7) : dataAtual.slice(0, 7),
      dataPagamento: dataAtual, rendimento: Number.isFinite(rendimento) ? rendimento : 0, imposto: 0,
    };
    const msgErro = r.ok ? null : r.status === 404
      ? "Lançamento não encontrado no Questor, ou a API ainda não tem o endpoint de exclusão. Nada foi excluído."
      : `O Questor recusou a exclusão (HTTP ${r.status}): ${r.corpo.detail ?? r.corpo.erro ?? "sem detalhe"}`;

    await registrarLog({
      operacao: "exclusao", entrada, ...nomes, responsavel: email, chave,
      status: r.ok ? "lancado" : "erro", chaveQuestor: chaveQ, resposta: r.corpo, erro: msgErro,
    });
    if (!r.ok) return NextResponse.json({ error: msgErro }, { status: r.status === 404 ? 501 : 502 });
    await marcarExcluido(codigoempresa, chaveQ);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErroLucro) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[lucros-distribuidos/excluir]", e);
    return NextResponse.json({ error: "Falha ao excluir o lançamento." }, { status: 500 });
  }
}
