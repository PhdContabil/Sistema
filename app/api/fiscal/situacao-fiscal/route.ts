// Fiscal · Situação Fiscal
//   GET                                   -> carteira + situação gravada (só banco/Questor, sem custo)
//   POST { acao: "consultar", cnpj, razao_social } -> consulta UMA empresa na Receita (PAGA)
//   POST { acao: "reclassificar" }        -> reaplica a regra nos PDFs salvos (sem custo)
import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { exigirFiscal } from "../dare-sp/_auth";
import { consultarEmpresa, listarCarteira, reclassificarBloco } from "@/lib/situacao-fiscal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const erro = (e: unknown, padrao: string) =>
  NextResponse.json({ error: e instanceof Error ? e.message : padrao }, { status: 500 });

export async function GET() {
  noStore();
  if (!(await exigirFiscal())) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  try {
    return NextResponse.json(await listarCarteira());
  } catch (e) {
    return erro(e, "Falha ao listar.");
  }
}

export async function POST(req: Request) {
  const email = await exigirFiscal();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { acao?: string; cnpj?: string; razao_social?: string | null };
  try {
    if (body.acao === "consultar") {
      if (!body.cnpj) return NextResponse.json({ error: "Informe o CNPJ." }, { status: 400 });
      return NextResponse.json(await consultarEmpresa(body.cnpj, body.razao_social ?? null, email));
    }
    if (body.acao === "reclassificar") {
      return NextResponse.json(await reclassificarBloco(25));
    }
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e) {
    return erro(e, "Falha na operação.");
  }
}
