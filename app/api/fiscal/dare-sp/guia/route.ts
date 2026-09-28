import { NextResponse } from "next/server";
import { excluirGuia } from "@/lib/dare-sp";
import { exigirFiscal } from "../_auth";

export const dynamic = "force-dynamic";

/** Exclui (logicamente) uma guia emitida. Ver `excluirGuia`. */
export async function DELETE(req: Request) {
  const email = await exigirFiscal();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Guia não informada." }, { status: 400 });

  const erro = await excluirGuia(id, email);
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });
  return NextResponse.json({ ok: true });
}
