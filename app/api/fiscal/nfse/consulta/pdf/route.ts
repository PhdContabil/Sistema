import { NextResponse } from "next/server";
import { exigirFiscal } from "../../_auth";
import { pdfDaConsulta } from "@/lib/fiscal/nfse-consulta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { chave, xml_gz } — PDF da nota consultada (nada é guardado). */
export async function POST(req: Request) {
  if (!(await exigirFiscal())) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { chave?: string; xml_gz?: string };
  if (!b.chave || !b.xml_gz) return NextResponse.json({ error: "Informe a nota." }, { status: 400 });
  try {
    const pdf = await pdfDaConsulta(b.chave, b.xml_gz);
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="NFSe-${b.chave}.pdf"` } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao gerar o PDF." }, { status: 502 });
  }
}
