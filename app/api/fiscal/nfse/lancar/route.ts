import { NextResponse } from "next/server";
import { exigirFiscal } from "../_auth";
import { lancarNoQuestor } from "@/lib/fiscal/nfse-fiscal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { id } — lança no Questor a NFS-e emitida. */
export async function POST(req: Request) {
  const email = await exigirFiscal();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { id?: number };
  if (!b.id) return NextResponse.json({ error: "Informe a nota." }, { status: 400 });
  const r = await lancarNoQuestor(Number(b.id), email);
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
