// Fiscal › Notas Fiscais › Consultar notas
//   GET  ?acao=empresas                      -> empresas cadastradas para captura
//   GET  ?cnpj=...&nsu=0                     -> notas do Portal Nacional (repita com proximoNsu enquanto incompleto)
//   POST { acao: "cadastrar", codigoempresa, nome, cnpj } · { acao: "remover", codigoempresa }
import { NextResponse } from "next/server";
import { exigirFiscal } from "../_auth";
import { capturarNotas, cadastrarEmpresaConsulta, listarEmpresasConsulta, removerEmpresaConsulta } from "@/lib/fiscal/nfse-consulta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SEM = "Sem acesso ao módulo Fiscal.";
const erro = (e: unknown, status = 502) => NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status });

export async function GET(req: Request) {
  if (!(await exigirFiscal())) return NextResponse.json({ error: SEM }, { status: 403 });
  const u = new URL(req.url).searchParams;
  try {
    if (u.get("acao") === "empresas") return NextResponse.json({ empresas: await listarEmpresasConsulta() });
    return NextResponse.json(await capturarNotas(u.get("cnpj") ?? "", Number(u.get("nsu") ?? 0)));
  } catch (e) { return erro(e); }
}

export async function POST(req: Request) {
  const email = await exigirFiscal();
  if (!email) return NextResponse.json({ error: SEM }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { acao?: string; codigoempresa?: number; nome?: string; cnpj?: string };
  try {
    if (b.acao === "cadastrar") await cadastrarEmpresaConsulta({ codigoempresa: Number(b.codigoempresa), nome: b.nome ?? "", cnpj: b.cnpj ?? "" }, email);
    else if (b.acao === "remover") await removerEmpresaConsulta(Number(b.codigoempresa));
    else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    return NextResponse.json({ ok: true, empresas: await listarEmpresasConsulta() });
  } catch (e) { return erro(e, 422); }
}
