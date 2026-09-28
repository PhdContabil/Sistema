import { NextResponse } from "next/server";
import { obterGuia } from "@/lib/dare-sp";
import { enviarGuiaAoTareffa } from "@/lib/dare-sp-tareffa";
import { exigirFiscal } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Reenvia ao Tareffa uma guia que já está no Zen. */
export async function POST(req: Request) {
  const email = await exigirFiscal();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });

  let body: { guia_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const g = body.guia_id ? await obterGuia(body.guia_id) : null;
  if (!g) return NextResponse.json({ error: "Guia não encontrada." }, { status: 404 });
  if (!g.pdf_base64) return NextResponse.json({ error: "Esta guia não tem PDF guardado." }, { status: 422 });

  const falha = await enviarGuiaAoTareffa({
    id: g.id, codigoImposto: g.codigoimposto, competencia: g.competencia, cnpj: g.cnpj, pdfBase64: g.pdf_base64,
  });
  if (falha) return NextResponse.json({ error: falha }, { status: 502 });
  return NextResponse.json({ ok: true });
}
