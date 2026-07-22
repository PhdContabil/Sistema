// Endpoint "keep-alive" — disparado pelo Vercel Cron 1x por dia.
// Faz uma query trivial no Supabase só pra manter o projeto ativo
// (plano Free pausa projetos com 7+ dias sem atividade).
//
// Não precisa de auth porque não retorna nem altera dado sensível.
// Pra blindar contra abuse, ainda exige CRON_SECRET se configurado.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function hasCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  if (auth && auth === `Bearer ${secret}`) return true;
  const x = req.headers.get("x-cron-secret");
  if (x && x === secret) return true;
  return false;
}

async function handle(req: NextRequest) {
  if (!hasCronSecret(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svc) {
    return NextResponse.json(
      { ok: false, error: "Supabase env vars missing" },
      { status: 500 }
    );
  }

  const t0 = Date.now();
  try {
    // HEAD/count na tabela processos — gera atividade real no DB
    // sem trafegar payload pesado.
    const r = await fetch(
      `${url}/rest/v1/m/societario/processos?select=id&limit=1`,
      {
        headers: {
          apikey: svc,
          Authorization: `Bearer ${svc}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );
    const status = r.status;
    return NextResponse.json({
      ok: r.ok,
      status,
      durationMs: Date.now() - t0,
      at: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
