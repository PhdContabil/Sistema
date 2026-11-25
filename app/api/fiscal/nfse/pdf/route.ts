import { NextResponse } from "next/server";
import { exigirFiscal } from "../_auth";
import { pdfPorChave } from "@/lib/nfse/procuracao";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!(await exigirFiscal())) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  const chave = String(new URL(req.url).searchParams.get("chave") ?? "").replace(/\D/g, "");
  if (chave.length !== 50) return NextResponse.json({ error: "Chave inválida." }, { status: 400 });
  try {
    const pdf = await pdfPorChave(chave);
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="NFSe-${chave}.pdf"` } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao gerar o PDF." }, { status: 502 });
  }
}
