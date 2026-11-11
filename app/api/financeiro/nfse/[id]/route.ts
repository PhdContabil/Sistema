import { NextResponse } from "next/server";
import { exigirFinanceiro } from "../_auth";
import { emitirNota, baixarEPublicar, marcarManual, ignorar, verificarNota, alterarData, pdfDaNota } from "@/lib/nfse/servico";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** DANFSe (PDF) da nota emitida. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const email = await exigirFinanceiro();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Financeiro." }, { status: 403 });
  try {
    const { nome, bytes } = await pdfDaNota(Number(params.id));
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nome}"` } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status: 400 });
  }
}

/** Ações numa nota: verificar | emitir | pdf | manual | ignorar | voltar. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const email = await exigirFinanceiro();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Financeiro." }, { status: 403 });
  const id = Number(params.id);
  let b: { acao?: string; data?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  try {
    switch (b.acao) {
      case "data": await alterarData(id, b.data ?? ""); return NextResponse.json({ ok: true });
      case "verificar": return NextResponse.json(await verificarNota(id));
      case "emitir": return NextResponse.json(await emitirNota(id, email));
      case "pdf": return NextResponse.json(await baixarEPublicar(id));
      case "manual": await marcarManual(id, email); return NextResponse.json({ ok: true });
      case "ignorar": await ignorar(id, false); return NextResponse.json({ ok: true });
      case "voltar": await ignorar(id, true); return NextResponse.json({ ok: true });
      default: return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status: 500 });
  }
}
