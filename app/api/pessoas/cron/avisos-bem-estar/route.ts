// Vercel Cron, 1x por dia às 8h (11:00 UTC): avisa por e-mail e Teams os
// eventos de Bem-Estar novos na agenda. Só roda com o CRON_SECRET.
import { NextRequest, NextResponse } from "next/server";
import { avisarEventosBemEstar } from "@/lib/pessoas/avisos-bem-estar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await avisarEventosBemEstar()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "falha" }, { status: 500 });
  }
}
