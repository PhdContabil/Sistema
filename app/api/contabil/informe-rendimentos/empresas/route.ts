import { NextResponse } from "next/server";
import { getEmpresas, hasApiKey, QuestorError } from "@/lib/questor";
import { exigirContabil } from "../_auth";

export const dynamic = "force-dynamic";

/**
 * Empresas elegíveis ao informe — mesmo filtro do Access: ativas, com CNPJ
 * (TIPOINSCR = 2) e código abaixo de 9000. O regime NÃO entra aqui: vem do
 * Tareffa, empresa a empresa, ao calcular.
 */
export async function GET() {
  if (!(await exigirContabil())) return NextResponse.json({ error: "Sem acesso ao módulo Contábil." }, { status: 403 });
  if (!hasApiKey()) return NextResponse.json({ error: "QUESTOR_API_KEY não configurada no servidor." }, { status: 412 });
  try {
    const r = await getEmpresas(true);
    const empresas = (r.dados ?? [])
      .filter((e) => e.ativa && e.codigoempresa < 9000 && (e.cnpj ?? "").replace(/\D/g, "").length === 14)
      .map((e) => ({ codigo: e.codigoempresa, nome: e.nome ?? "", cnpj: e.cnpj }))
      .sort((a, b) => a.codigo - b.codigo);
    return NextResponse.json({ empresas });
  } catch (e) {
    const status = e instanceof QuestorError ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar a API Questor." }, { status });
  }
}
