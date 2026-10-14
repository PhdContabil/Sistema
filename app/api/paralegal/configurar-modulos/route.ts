import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso } from "@/lib/acesso";
import { chamar } from "@/lib/mei/api";

// Configurar módulos (Contábil, Patrimonial, Fiscal) de uma empresa nova — API Questor
// POST /empresas/{cod}/configurar-modulos. Por enquanto SÓ SIMULAÇÃO (dry_run) e só T.I.:
// GET ?cod=1463&regime=SN&inicio=2024-02-23[&plano=1]
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  if (!nivel.ti && !nivel.acessoTotal) return NextResponse.json({ error: "Só T.I." }, { status: 403 });
  const u = new URL(req.url);
  const cod = Number(u.searchParams.get("cod"));
  const regime = (u.searchParams.get("regime") || "SN").toUpperCase();
  const inicio = u.searchParams.get("inicio") || "";
  if (!cod || !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return NextResponse.json({ error: "Informe cod e inicio (AAAA-MM-DD)." }, { status: 400 });
  const corpo: Record<string, unknown> = { regime, data_inicio_trabalhos: inicio };
  if (u.searchParams.get("plano") === "1") corpo.copiar_plano_contas = true;
  const r = await chamar("POST", `/empresas/${cod}/configurar-modulos`, { query: { dry_run: "true" }, corpo, usuario: user?.email ?? null });
  return NextResponse.json({ status: r.status, simulacao: true, resposta: r.json });
}
