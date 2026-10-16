import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { sincronizar } from "@/lib/dare-sp";
import { hasApiKey } from "@/lib/questor";

// Sincronização automática da DARE SP (Vercel Cron, todo dia de manhã — ver vercel.json).
// Busca no Questor o ICMS dos últimos 6 meses, igual ao botão "Sincronizar dados".
// Sem sessão de usuário: exige Authorization: Bearer <CRON_SECRET> (o Vercel Cron envia sozinho).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!hasApiKey()) return NextResponse.json({ error: "QUESTOR_API_KEY não configurada." }, { status: 412 });
  try {
    const r = await sincronizar({ meses: 6 });
    return NextResponse.json({ ok: true, gravados: r.gravados, competencias: r.competencias });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao sincronizar." }, { status: 502 });
  }
}
