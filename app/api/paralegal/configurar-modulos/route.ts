import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso } from "@/lib/acesso";
import { chamar } from "@/lib/mei/api";

// Configurar módulos (Contábil, Patrimonial, Fiscal) de uma empresa nova — API Questor
// POST /empresas/{cod}/configurar-modulos. Só T.I./Diretoria.
//   GET  ?cod=1463&regime=SN&inicio=2024-02-23[&plano=1]  -> SIMULAÇÃO (dry_run)
//   POST { cod, regime, inicio, plano? }                   -> GRAVA de verdade (testes com o contábil)
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function usuarioTI() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return nivel.ti || nivel.acessoTotal ? (user?.email ?? null) : null;
}

function montar(cod: number, regime: string, inicio: string, plano: boolean) {
  if (!cod || !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return null;
  const corpo: Record<string, unknown> = { regime: regime.toUpperCase(), data_inicio_trabalhos: inicio };
  if (plano) corpo.copiar_plano_contas = true;
  return corpo;
}

export async function GET(req: Request) {
  const email = await usuarioTI();
  if (!email) return NextResponse.json({ error: "Só T.I." }, { status: 403 });
  const u = new URL(req.url);
  const cod = Number(u.searchParams.get("cod"));
  const corpo = montar(cod, u.searchParams.get("regime") || "SN", u.searchParams.get("inicio") || "", u.searchParams.get("plano") === "1");
  if (!corpo) return NextResponse.json({ error: "Informe cod e inicio (AAAA-MM-DD)." }, { status: 400 });
  const r = await chamar("POST", `/empresas/${cod}/configurar-modulos`, { query: { dry_run: "true" }, corpo, usuario: email });
  return NextResponse.json({ status: r.status, simulacao: true, resposta: r.json });
}

export async function POST(req: Request) {
  const email = await usuarioTI();
  if (!email) return NextResponse.json({ error: "Só T.I." }, { status: 403 });
  let b: { cod?: number; regime?: string; inicio?: string; plano?: boolean };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const regime = (b.regime || "SN").toUpperCase();
  if (regime !== "SN") return NextResponse.json({ error: "Por enquanto só Simples Nacional grava de verdade (LP/LR aguardam as empresas modelo)." }, { status: 400 });
  const cod = Number(b.cod);
  const corpo = montar(cod, regime, b.inicio || "", !!b.plano);
  if (!corpo) return NextResponse.json({ error: "Informe cod e inicio (AAAA-MM-DD)." }, { status: 400 });
  const r = await chamar("POST", `/empresas/${cod}/configurar-modulos`, { query: { dry_run: "false" }, corpo, usuario: email, idempotencia: `cfgmod-${cod}-${regime}-${b.inicio}`, liberar: true });
  return NextResponse.json({ status: r.status, simulacao: false, resposta: r.json });
}
