// Fiscal · Situação Fiscal — PDF do último relatório SITFIS salvo (?cnpj=)
import { NextResponse } from "next/server";
import { exigirFiscal } from "../../dare-sp/_auth";
import { obterPdf, soDigitos } from "@/lib/situacao-fiscal";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await exigirFiscal())) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  const cnpj = soDigitos(new URL(req.url).searchParams.get("cnpj"));
  try {
    const pdf = await obterPdf(cnpj);
    if (!pdf) return NextResponse.json({ error: "Relatório não disponível. Consulte a empresa primeiro." }, { status: 404 });
    return new NextResponse(Buffer.from(pdf, "base64"), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="SITFIS_${cnpj}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ler o PDF." }, { status: 500 });
  }
}
