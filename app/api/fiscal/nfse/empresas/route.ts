import { NextResponse } from "next/server";
import { exigirFiscal } from "../_auth";
import { listarEmpresasFiscal } from "@/lib/fiscal/nfse-fiscal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Empresas ativas do Questor (código, nome, CNPJ, regime) para a lista de emissão. */
export async function GET() {
  if (!(await exigirFiscal())) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  try {
    return NextResponse.json({ empresas: await listarEmpresasFiscal() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status: 502 });
  }
}
