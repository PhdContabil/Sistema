// Endpoint disparado pelo Vercel Cron (vercel.json) E pelo botão "Atualizar"
// dentro do app.
//
// Auth aceita 3 formas (qualquer uma libera):
//  1. Header Authorization: Bearer <CRON_SECRET>  (Vercel Cron envia automático)
//  2. Header x-cron-secret: <CRON_SECRET>          (chamada manual via curl)
//  3. Usuário logado com sessão Supabase válida e autorizado
//
// Query params:
//   ?windows=N   -> varre N janelas de 30 dias para trás (default 2)
//   ?mode=...    -> "updated" (default) ou "started"

import { NextRequest, NextResponse } from "next/server";
import { syncTareffaToSupabase } from "@/lib/societario/syncTareffa";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { isEmailAllowed, isAdmin } from "@/lib/societario/options";

// Garante runtime Node (precisamos do @supabase/supabase-js e fetch sem edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Pro plan: até 300s. No Hobby cai para 10s — mantemos 60s para ficar safe nos dois.
export const maxDuration = 60;

function hasCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // sem secret configurado, libera (DEV)
  const auth = req.headers.get("authorization");
  if (auth && auth === `Bearer ${secret}`) return true;
  const x = req.headers.get("x-cron-secret");
  if (x && x === secret) return true;
  return false;
}

async function isLoggedAndAuthorized(): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    if (!user?.email) return false;
    // Allowlist hardcoded ou admin (mais barato que ir ao DB)
    if (isEmailAllowed(user.email) || isAdmin(user.email)) return true;
    // Senão, valida na tabela usuarios_autorizados
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !svc) return false;
    const r = await fetch(
      `${url}/rest/v1/usuarios_autorizados?select=id,active&email=eq.${encodeURIComponent(
        user.email.toLowerCase()
      )}&limit=1`,
      {
        headers: {
          apikey: svc,
          Authorization: `Bearer ${svc}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );
    if (!r.ok) return false;
    const rows = (await r.json()) as Array<{ id: number; active: boolean }>;
    return !!(rows[0] && rows[0].active);
  } catch {
    return false;
  }
}

async function authorize(req: NextRequest): Promise<boolean> {
  if (hasCronSecret(req)) return true;
  return isLoggedAndAuthorized();
}

async function handle(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const windowsParam = Number(searchParams.get("windows") || "2");
  const modeParam = searchParams.get("mode") === "started" ? "started" : "updated";

  try {
    const result = await syncTareffaToSupabase({
      windows: Number.isFinite(windowsParam) ? windowsParam : 2,
      mode: modeParam,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 207 });
  } catch (e) {
    const msg = (e as Error)?.message || String(e);
    return NextResponse.json(
      { ok: false, error: msg },
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
