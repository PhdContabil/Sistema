// Agendador da NFS-e: chamado a cada 10 min pelo pg_cron do Supabase (job
// "nfse-pdf-zen"). Tenta de novo o PDF oficial do Portal, o Zen e o Questor das
// notas emitidas que ainda não fecharam. Sem token válido recusa (401).
// Token: CRON_SECRET (ambiente) ou NFSE_PDF_TOKEN (app_config, lido pelo pg_cron).
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processarPendentesPdf } from "@/lib/nfse/servico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const iguais = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

async function autorizado(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("authorization");
  const enviado = req.headers.get("x-cron-secret") ?? (auth?.startsWith("Bearer ") ? auth.slice(7) : "");
  if (!enviado) return false;
  if (process.env.CRON_SECRET && iguais(enviado, process.env.CRON_SECRET)) return true;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data } = await sb.from("app_config").select("valor").eq("chave", "NFSE_PDF_TOKEN").maybeSingle();
  const token = data?.valor ?? "";
  return token.length >= 32 && iguais(enviado, token);
}

export async function GET(req: NextRequest) {
  if (!(await autorizado(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ sucesso: true, resultado: await processarPendentesPdf() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "falha" }, { status: 500 });
  }
}
