import { NextResponse } from "next/server";
import { excluirInformeRendimentos, hasWriteKey } from "@/lib/questor";
import { ehTipoInforme, type EntradaInforme, type Regime } from "@/lib/informe-rendimentos";
import { buscarLinha, marcarLinha, registrarLog } from "@/lib/informe-rendimentos-log";
import { registrarLogInforme } from "@/lib/log-sharepoint";
import { chaveExcluir, corpoExcluir, ehStatusAtivo, linhasDaResposta } from "@/lib/informe-rendimentos-alteracao";
import { exigirContabil } from "../_auth";

export const dynamic = "force-dynamic";

const avisoDe = (r: "gravado" | "desligado" | "falhou") => (r === "gravado" ? "ok" : r === "falhou" ? "falhou" : "desligada");
export const maxDuration = 60;

/**
 * Exclui do Questor as linhas que o Núcleo gravou para um informe (só elas, com
 * conferência do valor). Sem `confirmar: true` é só simulação (dry_run).
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
      return NextResponse.json({ error: "Este lançamento não pode ser excluído por aqui (já foi alterado, excluído ou veio do Access)." }, { status: 409 });
    }
    const atual = linhasDaResposta(linha.resposta);
    if (!atual) {
      return NextResponse.json({ error: "Este lançamento não tem linhas gravadas no Questor (informe zerado): não há o que excluir." }, { status: 409 });
    }

    const chave = chaveExcluir(linha.id, linha.codigoempresa, linha.competencia);
    const r = await excluirInformeRendimentos(
      linha.codigoempresa,
      corpoExcluir({ usuario: email, competencia: linha.competencia, tipo: linha.tipo }, atual),
      { dryRun: !confirmar, idempotencyKey: confirmar ? chave : `${chave}:dry` }
    );
    // Para o log da exclusão: os mesmos valores do lançamento que saiu.
    const entrada: EntradaInforme = {
      tipo: linha.tipo, codigoempresa: linha.codigoempresa, competencia: linha.competencia,
      rendimento: Number(linha.rendimento), demaisReceitas: Number(linha.demais_receitas),
      dividendos: Number(linha.dividendos), retencao: Number(linha.retencao),
    };
    const regime = (linha.regime === "real" ? "real" : "presumido") as Regime;
    const plano = { ...montarPlanoVazio(entrada, regime), totais: { pis: Number(linha.pis), cofins: Number(linha.cofins), base: 0 } };

    if (!r.ok) {
      const detalhe = r.corpo.detail ?? r.corpo.erro ?? "sem detalhe";
      const msg = r.status === 409 ? `O Questor recusou a exclusão: ${detalhe}`
        : r.status === 404 ? `O Questor não encontrou as linhas deste informe (talvez já tenham sido apagadas lá): ${detalhe}`
        : `O Questor recusou a exclusão (HTTP ${r.status}): ${detalhe}`;
      if (confirmar) await registrarLog({ entrada, plano, nomeEmpresa: linha.nome_empresa, status: "erro", responsavel: email, chave, resposta: r.corpo, erro: msg });
      return NextResponse.json({ error: msg }, { status: r.status === 409 || r.status === 404 ? r.status : 502 });
    }

    if (!confirmar) {
      return NextResponse.json({ ok: true, dryRun: true, ecf: r.corpo.ecf ?? [], f100: r.corpo.f100 ?? [], avisos: r.corpo.avisos ?? [] });
    }

    await registrarLog({ entrada, plano, nomeEmpresa: linha.nome_empresa, status: "excluido", responsavel: email, chave, resposta: { ...r.corpo, excluido_de: linha.id } });
    await marcarLinha(linha.id, "excluido_depois");
    // Aviso no Teams (fluxo do Power Automate lê o STATUS da linha). Reenvio idempotente não avisa de novo.
    const repetido = r.corpo.repetido === true;
    const notificacao = repetido ? "desligada" : avisoDe(await registrarLogInforme({
      evento: "excluido", competencia: entrada.competencia, codigoempresa: entrada.codigoempresa, nomeEmpresa: linha.nome_empresa,
      rendimento: entrada.rendimento, retencao: entrada.retencao, demaisReceitas: entrada.demaisReceitas, dividendos: entrada.dividendos,
    }, email));
    return NextResponse.json({ ok: true, repetido, notificacao, avisos: r.corpo.avisos ?? [] });
  } catch (e) {
    console.error("[informe-rendimentos/excluir]", e);
    return NextResponse.json({ error: "Falha ao excluir o informe." }, { status: 500 });
  }
}

/** Plano só com o necessário para o log (não vai para o Questor). */
function montarPlanoVazio(e: EntradaInforme, regime: Regime) {
  return { tipo: e.tipo, regime, codigoempresa: e.codigoempresa, competencia: e.competencia, ecf: [], f100: [], totais: { pis: 0, cofins: 0, base: 0 }, avisos: [] as string[] };
}
