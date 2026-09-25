import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { obterGuia } from "@/lib/dare-sp";
import { exigirFiscal } from "../_auth";

export const dynamic = "force-dynamic";

/**
 * Devolve o PDF oficial que a Sefaz gerou, guardado em base64 na emissão.
 *
 * Reemitir na Sefaz para só ver a guia de novo geraria outro número de
 * controle — duas guias vivas para o mesmo débito. O PDF fica conosco.
 */
export async function GET(req: Request) {
  noStore();

  const email = await exigirFiscal();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Informe o id da guia." }, { status: 400 });

  const guia = await obterGuia(id);
  if (!guia) return NextResponse.json({ error: "Guia não encontrada." }, { status: 404 });
  if (!guia.pdf_base64) {
    return NextResponse.json(
      { error: "Esta guia foi emitida sem PDF. Gere uma nova guia." },
      { status: 404 }
    );
  }

  const bytes = Buffer.from(guia.pdf_base64, "base64");
  const nome = `DARE-SP ${guia.competencia.replace("/", "-")} ${guia.cnpj}.pdf`;

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      // inline: quem clicou quer conferir a guia, não caçar na pasta de downloads.
      "Content-Disposition": `inline; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
