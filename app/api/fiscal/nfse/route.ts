import { NextResponse } from "next/server";
import { exigirFiscal } from "./_auth";
import { obterEmpresaFiscal, notasEmitidasFiscal, emitirNotaFiscal, ambienteFiscal, type PedidoNotaFiscal } from "@/lib/fiscal/nfse-fiscal";

// Fiscal › Notas Fiscais: NFS-e de clientes do Simples pelo Portal Nacional (certificado da PHD + procuração).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET ?cod= — cadastro da empresa (Simples, alíquota, atividade) + notas emitidas. Sem cod: últimas notas. */
export async function GET(req: Request) {
  if (!(await exigirFiscal())) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  const u = new URL(req.url).searchParams;
  const cod = Number(u.get("cod"));
  try {
    const empresa = cod ? await obterEmpresaFiscal(cod, u.get("data") || undefined) : null;
    return NextResponse.json({ ambiente: ambienteFiscal(), empresa, notas: await notasEmitidasFiscal(cod || undefined) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const email = await exigirFiscal();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  let b: PedidoNotaFiscal;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const r = await emitirNotaFiscal(b, email);
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
