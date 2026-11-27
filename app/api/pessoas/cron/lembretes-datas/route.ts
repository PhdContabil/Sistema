// Vercel Cron, 1x por dia às 8h (11:00 UTC): sincroniza a admissão com o Questor
// e manda os lembretes de Datas e Marcos que estiverem ligados (resumo do mês,
// tempo de casa e fim de experiência). Só roda com o CRON_SECRET.
import { NextRequest, NextResponse } from "next/server";
import { executarLembretes } from "@/lib/pessoas/datas-marcos-lembretes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await executarLembretes()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "falha" }, { status: 500 });
  }
}
