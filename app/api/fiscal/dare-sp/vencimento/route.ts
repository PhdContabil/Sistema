import { NextResponse } from "next/server";
import { definirVencimento } from "@/lib/dare-sp";
import { exigirFiscal } from "../_auth";

export const dynamic = "force-dynamic";

/** Corrige o vencimento do débito. Marcado como manual: o sync não desfaz. */
export async function PUT(req: Request) {
  const email = await exigirFiscal();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });

  let b: {
    codigoempresa?: number; codigoestab?: number;
    competencia?: string; codigoimposto?: string; vencimento?: string;
  };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  if (!b.codigoempresa || !b.competencia || !b.codigoimposto) {
    return NextResponse.json({ error: "Débito não informado." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.vencimento ?? "")) {
    return NextResponse.json({ error: "Vencimento deve ser AAAA-MM-DD." }, { status: 400 });
  }

  const erro = await definirVencimento(
    b.codigoempresa, b.codigoestab ?? 0, b.competencia, b.codigoimposto, b.vencimento!
  );
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });
  return NextResponse.json({ ok: true });
}
