import { NextResponse } from "next/server";
import { obterRegimeEmpresa } from "@/lib/tareffa-regime";
import { tareffaConfigurado, TareffaError } from "@/lib/tareffa-documentos";
import { exigirContabil } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Regime tributário da empresa no Tareffa — só consulta (para a tela já
 * mostrar "Lucro Presumido"/"Lucro Real" ao escolher a empresa). O cálculo e a
 * gravação continuam lendo o regime no servidor, nunca confiam neste valor.
 */
export async function GET(req: Request) {
  if (!(await exigirContabil())) return NextResponse.json({ error: "Sem acesso ao módulo Contábil." }, { status: 403 });
  const codigo = Number(new URL(req.url).searchParams.get("codigo"));
  if (!Number.isInteger(codigo) || codigo <= 0) return NextResponse.json({ error: "Código da empresa inválido." }, { status: 400 });
  if (!tareffaConfigurado()) return NextResponse.json({ error: "Tareffa não configurado no servidor." }, { status: 412 });
  try {
    const r = await obterRegimeEmpresa(codigo);
    if (!r) return NextResponse.json({ error: `Empresa ${codigo} não encontrada no Tareffa (Código ERP ${codigo}-1).` }, { status: 404 });
    return NextResponse.json({ regime: r.regime, regimeDescricao: r.regimeDescricao, razaoSocial: r.razaoSocial });
  } catch (e) {
    const m = e instanceof TareffaError ? e.message : "falha ao consultar o Tareffa";
    return NextResponse.json({ error: `Não consegui ler o regime no Tareffa: ${m}` }, { status: 502 });
  }
}
