import { NextResponse } from "next/server";
import { exigirFinanceiro } from "./_auth";
import { importar, listar, criarAvulsa, type DadosAvulsa } from "@/lib/nfse/servico";
import { lerCsv } from "@/lib/nfse/formato";
import { listarEmpresas, paraConfig } from "@/lib/nfse/empresas";
import { problemasConfig } from "@/lib/nfse/nacional-formato";
import { getRpsNfse, QuestorError } from "@/lib/questor";
import { hasQuestorZenToken } from "@/lib/questor-zen";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const email = await exigirFinanceiro();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Financeiro." }, { status: 403 });
  const u = new URL(req.url).searchParams;
  try {
    const empresas = await listarEmpresas();
    const empresa = Number(u.get("empresa")) || empresas[0]?.codigoempresa || 725;
    const notas = await listar({ empresa, status: u.get("status") || undefined, de: Number(u.get("de")) || undefined, ate: Number(u.get("ate")) || undefined });
    return NextResponse.json({
      notas, empresa, zen: hasQuestorZenToken(),
      empresas: empresas.map((e) => ({ ...e, falta: problemasConfig(paraConfig(e)), certOk: !!e.cert_validade && new Date(e.cert_validade).getTime() > Date.now() })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status: 500 });
  }
}

/** Importa RPS: { acao: "csv", texto, arquivo } ou { acao: "questor", data_inicio, data_fim, rps_inicio, rps_fim }. */
export async function POST(req: Request) {
  const email = await exigirFinanceiro();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Financeiro." }, { status: 403 });
  let b: { acao?: string; texto?: string; arquivo?: string; data_inicio?: string; data_fim?: string; rps_inicio?: number; rps_fim?: number; data_manual?: string; empresa?: number; avulsa?: DadosAvulsa };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const empresa = Number(b.empresa) || 725;
  try {
    if (b.acao === "csv") {
      const linhas = lerCsv(b.texto ?? "");
      if (linhas.length === 0) return NextResponse.json({ error: "O arquivo não tem linhas." }, { status: 400 });
      return NextResponse.json(await importar(linhas, "csv", b.arquivo ?? null, email, b.data_manual, empresa));
    }
    if (b.acao === "avulsa") return NextResponse.json({ ok: true, ...(await criarAvulsa(empresa, b.avulsa ?? {}, email)) });
    if (b.acao === "questor") {
      const r = await getRpsNfse({ data_inicio: b.data_inicio, data_fim: b.data_fim, rps_inicio: b.rps_inicio, rps_fim: b.rps_fim, codigoempresa: empresa });
      return NextResponse.json(await importar(r.dados ?? [], "questor", null, email, b.data_manual, empresa));
    }
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e) {
    if (e instanceof QuestorError && e.status === 404) {
      return NextResponse.json({ error: "A rota de RPS ainda não existe na API do Questor. Use o upload do CSV por enquanto." }, { status: 501 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao importar." }, { status: 500 });
  }
}
