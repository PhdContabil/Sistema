import { NextResponse } from "next/server";
import { exigirFiscal } from "../_auth";
import { cancelarNotaFiscal } from "@/lib/fiscal/nfse-fiscal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { id, motivo: 1|2|9, justificativa } — cancela a NFS-e no Portal Nacional (evento e101101). */
export async function POST(req: Request) {
  const email = await exigirFiscal();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { id?: number; motivo?: number; justificativa?: string };
  if (!b.id) return NextResponse.json({ error: "Informe a nota." }, { status: 400 });
  const r = await cancelarNotaFiscal(Number(b.id), Number(b.motivo ?? 1), String(b.justificativa ?? ""), email);
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
