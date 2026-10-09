import { NextResponse } from "next/server";
import { getSocios, hasApiKey, QuestorError } from "@/lib/questor";
import { exigirContabil } from "../../informe-rendimentos/_auth";

export const dynamic = "force-dynamic";

/** Sócios atuais de uma empresa (mesmo filtro do Access: sem data de saída). */
export async function GET(req: Request) {
  if (!(await exigirContabil())) return NextResponse.json({ error: "Sem acesso ao módulo Contábil." }, { status: 403 });
  if (!hasApiKey()) return NextResponse.json({ error: "QUESTOR_API_KEY não configurada no servidor." }, { status: 412 });
  const empresa = Number(new URL(req.url).searchParams.get("empresa"));
  if (!Number.isInteger(empresa) || empresa <= 0) return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  try {
    const r = await getSocios(false);
    const socios = (r.dados ?? [])
      .filter((s) => s.codigoempresa === empresa)
      .map((s) => ({ codigo: s.codigosocio, nome: s.nomesocio ?? "" }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return NextResponse.json({ socios });
  } catch (e) {
    const status = e instanceof QuestorError ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar a API Questor." }, { status });
  }
}
