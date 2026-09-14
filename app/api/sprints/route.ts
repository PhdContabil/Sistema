import { NextResponse } from "next/server";
import { listarSprints, criarSprint, ehData } from "@/lib/sprints";
import { exigirTI } from "./_auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const email = await exigirTI();
  if (!email) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  return NextResponse.json({ sprints: await listarSprints() });
}

export async function POST(req: Request) {
  const email = await exigirTI();
  if (!email) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });

  let body: { nome?: string; inicio?: string; fim?: string; objetivo?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  const nome = (body.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Dê um nome à sprint." }, { status: 400 });
  if (!ehData(body.inicio) || !ehData(body.fim)) {
    return NextResponse.json({ error: "Datas inválidas." }, { status: 400 });
  }
  if (body.fim < body.inicio) {
    return NextResponse.json({ error: "O fim não pode ser antes do início." }, { status: 400 });
  }

  const { id, error } = await criarSprint(
    { nome, inicio: body.inicio, fim: body.fim, objetivo: body.objetivo ?? null },
    email
  );
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true, id });
}
