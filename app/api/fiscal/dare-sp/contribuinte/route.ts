import { NextResponse } from "next/server";
import { obterContribuinte, salvarContribuinte } from "@/lib/dare-sp";
import { exigirFiscal } from "../_auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const email = await exigirFiscal();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });

  const cnpj = new URL(req.url).searchParams.get("cnpj");
  if (!cnpj) return NextResponse.json({ error: "CNPJ não informado." }, { status: 400 });

  return NextResponse.json({ contribuinte: await obterContribuinte(cnpj) });
}

export async function PUT(req: Request) {
  const email = await exigirFiscal();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });

  let b: { cnpj?: string; razao_social?: string; endereco?: string; cidade?: string; uf?: string; telefone?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  if (!b.cnpj || !b.endereco?.trim() || !b.cidade?.trim()) {
    return NextResponse.json({ error: "CNPJ, endereço e cidade são obrigatórios." }, { status: 400 });
  }

  const erro = await salvarContribuinte({
    cnpj: b.cnpj,
    razao_social: b.razao_social ?? null,
    endereco: b.endereco.trim(),
    cidade: b.cidade.trim(),
    uf: (b.uf || "SP").toUpperCase(),
    telefone: b.telefone ?? null,
  }, email);
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });
  return NextResponse.json({ ok: true });
}
