import { NextResponse } from "next/server";
import { obterGuia, marcarEnvioZen } from "@/lib/dare-sp";
import { enviarGuiaAoZen, temTokenZen } from "@/lib/dare-sp-zen";
import { exigirFiscal } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sobe ao Edoc uma guia já emitida — para quando o envio falhou na emissão. */
export async function POST(req: Request) {
  const email = await exigirFiscal();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  if (!temTokenZen()) {
    return NextResponse.json({ error: "Token do Questor Zen não configurado." }, { status: 412 });
  }

  let body: { guia_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!body.guia_id) return NextResponse.json({ error: "Guia não informada." }, { status: 400 });

  const g = await obterGuia(body.guia_id);
  if (!g) return NextResponse.json({ error: "Guia não encontrada." }, { status: 404 });
  if (!g.pdf_base64) {
    return NextResponse.json({ error: "Esta guia não tem PDF guardado." }, { status: 422 });
  }

  try {
    const r = await enviarGuiaAoZen({
      cnpj: g.cnpj,
      referencia: g.competencia,
      vencimento: g.data_pagamento,
      total: Number(g.total),
      pdfBase64: g.pdf_base64,
      nomeEmpresa: g.nome,
    });
    await marcarEnvioZen(g.id, r.documentoId);
    return NextResponse.json({ ok: true, documentoId: r.documentoId, arquivo: r.nomeArquivo });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao enviar ao Zen." },
      { status: 502 }
    );
  }
}
