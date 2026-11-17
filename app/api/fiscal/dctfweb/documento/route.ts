// Fiscal · DCTFWeb — guia (DARF) ou recibo em PDF, emitidos na hora pelo SERPRO.
//   GET ?id=&tipo=guia|recibo
import { NextResponse } from "next/server";
import { exigirFiscal } from "../../dare-sp/_auth";
import { emitirGuia, emitirRecibo } from "@/lib/dctfweb";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!(await exigirFiscal())) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const id = Number(q.get("id"));
  const tipo = q.get("tipo");
  if (!id || (tipo !== "guia" && tipo !== "recibo")) return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  try {
    const r = tipo === "guia" ? await emitirGuia(id) : await emitirRecibo(id);
    if (!r.ok) return NextResponse.json({ error: r.mensagem }, { status: 422 });
    return new NextResponse(Buffer.from(r.pdf, "base64"), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${r.nome}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao emitir." }, { status: 500 });
  }
}
