import { NextResponse } from "next/server";
import { sincronizar } from "@/lib/dare-sp";
import { hasApiKey } from "@/lib/questor";
import { exigirFiscal } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Puxa o ICMS da Questor para a competência escolhida e grava no banco. */
export async function POST(req: Request) {
  const email = await exigirFiscal();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  if (!hasApiKey()) {
    return NextResponse.json({ error: "QUESTOR_API_KEY não configurada." }, { status: 412 });
  }

  let body: { competencia?: string; ano?: number; meses?: number };
  try { body = await req.json(); } catch { body = {}; }

  if (body.competencia && !/^\d{2}\/\d{4}$/.test(body.competencia)) {
    return NextResponse.json({ error: "Competência deve ser MM/AAAA." }, { status: 400 });
  }

  try {
    const r = await sincronizar({
      competencia: body.competencia,
      ano: body.ano,
      meses: body.competencia || body.ano ? undefined : (body.meses ?? 6),
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao sincronizar." },
      { status: 502 }
    );
  }
}
