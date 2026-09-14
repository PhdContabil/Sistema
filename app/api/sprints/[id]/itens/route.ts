import { NextResponse } from "next/server";
import { adicionarItem, atualizarItem, removerItem } from "@/lib/sprints";
import { exigirTI } from "../../_auth";

export const dynamic = "force-dynamic";

/** Aceita número, vírgula decimal ou vazio (que limpa). */
function horas(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const email = await exigirTI();
  if (!email) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });

  let body: { ticket_id?: string; responsavel_email?: string | null; horas_planejadas?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!body.ticket_id) return NextResponse.json({ error: "Cartão não informado." }, { status: 400 });

  const h = horas(body.horas_planejadas);
  const erro = await adicionarItem(
    params.id,
    body.ticket_id,
    {
      responsavel_email: body.responsavel_email ? String(body.responsavel_email).toLowerCase() : null,
      horas_planejadas: h === undefined ? null : h,
    },
    email
  );
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const email = await exigirTI();
  if (!email) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });

  let body: { ticket_id?: string; responsavel_email?: string | null; horas_planejadas?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!body.ticket_id) return NextResponse.json({ error: "Cartão não informado." }, { status: 400 });

  const campos: { responsavel_email?: string | null; horas_planejadas?: number | null } = {};
  if (body.responsavel_email !== undefined) {
    campos.responsavel_email = body.responsavel_email ? String(body.responsavel_email).toLowerCase() : null;
  }
  if (body.horas_planejadas !== undefined) {
    const h = horas(body.horas_planejadas);
    if (h === undefined) return NextResponse.json({ error: "Horas inválidas." }, { status: 400 });
    campos.horas_planejadas = h;
  }
  if (Object.keys(campos).length === 0) return NextResponse.json({ ok: true });

  const erro = await atualizarItem(params.id, body.ticket_id, campos);
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const email = await exigirTI();
  if (!email) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });

  const ticketId = new URL(req.url).searchParams.get("ticket_id");
  if (!ticketId) return NextResponse.json({ error: "Cartão não informado." }, { status: 400 });

  const erro = await removerItem(params.id, ticketId);
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });
  return NextResponse.json({ ok: true });
}
