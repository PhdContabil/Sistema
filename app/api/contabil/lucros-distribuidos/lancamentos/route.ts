import { NextResponse } from "next/server";
import { hasApiKey, listarLucrosDistribuidos, QuestorError } from "@/lib/questor";
import { ehData } from "@/lib/lucros-distribuidos";
import { exigirContabil } from "../../informe-rendimentos/_auth";

export const dynamic = "force-dynamic";

/**
 * Lançamentos já gravados no Questor (OUTRORENDIMENTOPAGO) num período — a
 * lista do form_log do Access, de onde se ajusta e se exclui.
 */
export async function GET(req: Request) {
  if (!(await exigirContabil())) return NextResponse.json({ error: "Sem acesso ao módulo Contábil." }, { status: 403 });
  if (!hasApiKey()) return NextResponse.json({ error: "QUESTOR_API_KEY não configurada no servidor." }, { status: 412 });
  const q = new URL(req.url).searchParams;
  const inicio = q.get("inicio") ?? "";
  const fim = q.get("fim") ?? "";
  const empresa = q.get("empresa") ? Number(q.get("empresa")) : undefined;
  if (!ehData(inicio) || !ehData(fim)) return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  if (empresa !== undefined && (!Number.isInteger(empresa) || empresa <= 0)) return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  try {
    return NextResponse.json({ lancamentos: await listarLucrosDistribuidos({ codigoempresa: empresa, inicio, fim }) });
  } catch (e) {
    if (e instanceof QuestorError && e.status === 404) {
      return NextResponse.json({ error: "A API do Questor ainda não tem o endpoint de lucros distribuídos." }, { status: 501 });
    }
    const status = e instanceof QuestorError ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar a API Questor." }, { status });
  }
}
