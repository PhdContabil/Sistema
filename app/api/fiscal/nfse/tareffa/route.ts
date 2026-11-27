import { NextResponse } from "next/server";
import { exigirFiscal } from "../_auth";
import { enviarNotaAoTareffa } from "@/lib/fiscal/nfse-tareffa";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { id } — publica o PDF da NFS-e emitida no Tareffa. */
export async function POST(req: Request) {
  if (!(await exigirFiscal())) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { id?: number };
  if (!b.id) return NextResponse.json({ error: "Informe a nota." }, { status: 400 });
  const r = await enviarNotaAoTareffa(Number(b.id));
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
