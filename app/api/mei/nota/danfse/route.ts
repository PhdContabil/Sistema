import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { pdfNotaMei } from "@/lib/mei/nfse-mei";

// PDF (DANFSe) de uma NFS-e de MEI emitida pelo Núcleo.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  if (!podeAcessarApp(nivel, "mei", "Sistema MEI")) return NextResponse.json({ error: "Sem acesso ao Sistema MEI." }, { status: 403 });
  const chave = String(new URL(req.url).searchParams.get("chave") ?? "").replace(/\D/g, "");
  if (chave.length !== 50) return NextResponse.json({ error: "Chave inválida." }, { status: 400 });
  try {
    const pdf = await pdfNotaMei(chave);
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="NFSe-${chave}.pdf"` } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao gerar o PDF." }, { status: 502 });
  }
}
