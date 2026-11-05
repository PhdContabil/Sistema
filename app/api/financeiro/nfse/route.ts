import { NextResponse } from "next/server";
import { exigirFinanceiro } from "./_auth";
import { importar, listar } from "@/lib/nfse/servico";
import { lerCsv } from "@/lib/nfse/formato";
import { credenciaisOk } from "@/lib/nfse/taboao";
import { getRpsNfse, QuestorError } from "@/lib/questor";
import { hasQuestorZenToken } from "@/lib/questor-zen";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const email = await exigirFinanceiro();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Financeiro." }, { status: 403 });
  const u = new URL(req.url).searchParams;
  try {
    const notas = await listar({ status: u.get("status") || undefined, de: Number(u.get("de")) || undefined, ate: Number(u.get("ate")) || undefined });
    return NextResponse.json({ notas, credenciais: credenciaisOk(), zen: hasQuestorZenToken() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status: 500 });
  }
}

/** Importa RPS: { acao: "csv", texto, arquivo } ou { acao: "questor", data_inicio, data_fim, rps_inicio, rps_fim }. */
export async function POST(req: Request) {
  const email = await exigirFinanceiro();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Financeiro." }, { status: 403 });
  let b: { acao?: string; texto?: string; arquivo?: string; data_inicio?: string; data_fim?: string; rps_inicio?: number; rps_fim?: number };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  try {
    if (b.acao === "csv") {
      const linhas = lerCsv(b.texto ?? "");
      if (linhas.length === 0) return NextResponse.json({ error: "O arquivo não tem linhas." }, { status: 400 });
      return NextResponse.json(await importar(linhas, "csv", b.arquivo ?? null, email));
    }
    if (b.acao === "questor") {
      const r = await getRpsNfse({ data_inicio: b.data_inicio, data_fim: b.data_fim, rps_inicio: b.rps_inicio, rps_fim: b.rps_fim });
      return NextResponse.json(await importar(r.dados ?? [], "questor", null, email));
    }
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e) {
    if (e instanceof QuestorError && e.status === 404) {
      return NextResponse.json({ error: "A rota de RPS ainda não existe na API do Questor. Use o upload do CSV por enquanto." }, { status: 501 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao importar." }, { status: 500 });
  }
}
