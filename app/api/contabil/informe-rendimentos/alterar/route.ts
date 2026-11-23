import { NextResponse } from "next/server";
import { alterarInformeRendimentos, hasWriteKey } from "@/lib/questor";
import { prepararInforme, ErroInforme } from "@/lib/informe-rendimentos-servico";
import { ehTipoInforme, planoZerado } from "@/lib/informe-rendimentos";
import { buscarLinha, marcarLinha, registrarLog } from "@/lib/informe-rendimentos-log";
import { chaveAlterar, corpoAlterar, ehStatusAtivo, linhasDaResposta, mesmosValores } from "@/lib/informe-rendimentos-alteracao";
import { exigirContabil } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Altera um informe já lançado pelo Núcleo. Sem `confirmar: true` é só simulação
 * (dry_run na API do Questor): nada é gravado. Empresa, competência e tipo não
 * mudam — para isso, exclua e lance de novo.
 */
export async function POST(req: Request) {
  const email = await exigirContabil();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Contábil." }, { status: 403 });

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const confirmar = corpo.confirmar === true;
  const id = Number(corpo.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Lançamento não informado." }, { status: 400 });
  if (!hasWriteKey()) return NextResponse.json({ error: "QUESTOR_WRITE_KEY não configurada no servidor." }, { status: 412 });

  try {
    const linha = await buscarLinha(id);
    if (!linha) return NextResponse.json({ error: "Lançamento não encontrado no histórico." }, { status: 404 });
    if (!ehStatusAtivo(linha.status) || linha.origem === "access" || !ehTipoInforme(linha.tipo)) {
      return NextResponse.json({ error: "Este lançamento não pode ser alterado por aqui (já foi alterado, excluído ou veio do Access)." }, { status: 409 });
    }
    const atual = linhasDaResposta(linha.resposta);
    if (!atual) {
      return NextResponse.json({ error: "Este lançamento não tem linhas gravadas no Questor (informe zerado). Para corrigir, lance um novo informe." }, { status: 409 });
    }

    // Empresa, competência e tipo vêm do lançamento original, nunca do navegador.
    const p = await prepararInforme({
      tipo: linha.tipo, codigoempresa: linha.codigoempresa, competencia: linha.competencia,
      rendimento: corpo.rendimento, demaisReceitas: corpo.demaisReceitas, dividendos: corpo.dividendos, retencao: corpo.retencao,
    });
    if (mesmosValores(linha, p.entrada)) return NextResponse.json({ error: "Nenhum valor foi alterado." }, { status: 400 });
    if (planoZerado(p.plano)) {
      return NextResponse.json({ error: "Com todos os valores zerados não há o que gravar. Para tirar o informe do Questor, use Excluir." }, { status: 400 });
    }
    if (confirmar && !p.gravacaoLiberada) return NextResponse.json({ error: p.motivoBloqueio }, { status: 423 });

    const chave = chaveAlterar(linha.id, p.entrada, p.regime);
    const r = await alterarInformeRendimentos(
      linha.codigoempresa,
      corpoAlterar({ usuario: email, competencia: linha.competencia, tipo: p.entrada.tipo, regime: p.regime }, atual, p.plano),
      { dryRun: !confirmar, idempotencyKey: confirmar ? chave : `${chave}:dry` }
    );
    if (!r.ok) {
      const detalhe = r.corpo.detail ?? r.corpo.erro ?? "sem detalhe";
      const msg = r.status === 404 ? `O Questor não encontrou as linhas deste informe: ${detalhe}`
        : r.status === 409 ? `O Questor recusou a alteração: ${detalhe}`
        : `O Questor recusou a alteração (HTTP ${r.status}): ${detalhe}`;
      if (confirmar) await registrarLog({ entrada: p.entrada, plano: p.plano, nomeEmpresa: p.nomeEmpresa, status: "erro", responsavel: email, chave, resposta: r.corpo, erro: msg });
      return NextResponse.json({ error: msg }, { status: r.status === 409 || r.status === 404 ? r.status : 502 });
    }

    if (!confirmar) {
      return NextResponse.json({ ok: true, dryRun: true, ecf: r.corpo.ecf ?? [], f100: r.corpo.f100 ?? [], avisos: r.corpo.avisos ?? [], totais: p.plano.totais, regimeDescricao: p.regimeDescricao });
    }

    // Novo registro com as linhas que ficaram no Questor (os seq servem para alterar de novo) e o antigo vira "alterado depois".
    const vivas = linhasDaResposta(r.corpo);
    await registrarLog({
      entrada: p.entrada, plano: p.plano, nomeEmpresa: p.nomeEmpresa, status: "alterado", responsavel: email, chave,
      resposta: { ok: true, ecf: vivas?.ecf ?? [], f100: vivas?.f100 ?? [], alteracao: r.corpo, alterado_de: linha.id },
    });
    await marcarLinha(linha.id, "alterado_depois");
    return NextResponse.json({ ok: true, repetido: r.corpo.repetido === true, ecf: r.corpo.ecf ?? [], f100: r.corpo.f100 ?? [], avisos: r.corpo.avisos ?? [] });
  } catch (e) {
    if (e instanceof ErroInforme) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[informe-rendimentos/alterar]", e);
    return NextResponse.json({ error: "Falha ao alterar o informe." }, { status: 500 });
  }
}
