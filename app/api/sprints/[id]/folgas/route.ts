import { NextResponse } from "next/server";
import { listarFolgas, adicionarFolga, adicionarFolgaPeriodo, removerFolga, ehData } from "@/lib/sprints";
import { exigirTI } from "../../_auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const email = await exigirTI();
  if (!email) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  return NextResponse.json({ folgas: await listarFolgas(params.id) });
}

/**
 * Lança folga. Com `ate`, lança o período inteiro de uma vez — férias
 * raramente são um dia só, e clicar quinze vezes seria trabalho à toa.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const email = await exigirTI();
  if (!email) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });

  let body: { data?: string; ate?: string | null; email?: string | null; motivo?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  if (!ehData(body.data)) return NextResponse.json({ error: "Data inválida." }, { status: 400 });
  const alvo = body.email ? String(body.email).toLowerCase() : null;
  const motivo = (body.motivo ?? "").trim() || null;

  if (body.ate) {
    if (!ehData(body.ate)) return NextResponse.json({ error: "Data final inválida." }, { status: 400 });
    if (body.ate < body.data) {
      return NextResponse.json({ error: "O fim não pode ser antes do início." }, { status: 400 });
    }
    const { criados, error } = await adicionarFolgaPeriodo(
      params.id, { de: body.data, ate: body.ate, email: alvo, motivo }, email
    );
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ ok: true, criados });
  }

  const erro = await adicionarFolga(params.id, { data: body.data, email: alvo, motivo }, email);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true, criados: 1 });
}

export async function DELETE(req: Request) {
  const email = await exigirTI();
  if (!email) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Folga não informada." }, { status: 400 });

  const erro = await removerFolga(id);
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });
  return NextResponse.json({ ok: true });
}
