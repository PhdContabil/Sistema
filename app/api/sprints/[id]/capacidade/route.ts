import { NextResponse } from "next/server";
import { salvarCapacidade, removerCapacidade } from "@/lib/sprints";
import { exigirTI } from "../../_auth";

export const dynamic = "force-dynamic";

function naoNegativo(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const email = await exigirTI();
  if (!email) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });

  let body: { email?: string; horas_dia?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  const alvo = (body.email ?? "").toLowerCase().trim();
  if (!alvo) return NextResponse.json({ error: "Pessoa não informada." }, { status: 400 });

  const hd = naoNegativo(body.horas_dia);
  if (body.horas_dia !== undefined && hd === undefined) {
    return NextResponse.json({ error: "Horas por dia inválidas." }, { status: 400 });
  }
  if (hd !== undefined && hd > 24) {
    return NextResponse.json({ error: "Ninguém tem mais de 24 h por dia." }, { status: 400 });
  }

  const erro = await salvarCapacidade(params.id, alvo, { horas_dia: hd });
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const email = await exigirTI();
  if (!email) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });

  const alvo = new URL(req.url).searchParams.get("email");
  if (!alvo) return NextResponse.json({ error: "Pessoa não informada." }, { status: 400 });

  const erro = await removerCapacidade(params.id, alvo.toLowerCase());
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });
  return NextResponse.json({ ok: true });
}
