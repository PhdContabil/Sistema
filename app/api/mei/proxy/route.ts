import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { chamar, rotaPermitida, chavesConfiguradas } from "@/lib/mei/api";

// Proxy do Sistema MEI para a API Questor (lista branca de rotas em lib/mei/api.ts).
// POST { metodo, caminho, query?, corpo?, idempotencia? }. GET devolve o estado das chaves.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function usuarioLiberado() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return podeAcessarApp(nivel, "mei", "Sistema MEI") ? (user?.email ?? "desconhecido") : null;
}

export async function GET() {
  if (!(await usuarioLiberado())) return NextResponse.json({ error: "Sistema MEI restrito à T.I." }, { status: 403 });
  return NextResponse.json(chavesConfiguradas());
}

export async function POST(req: Request) {
  const usuario = await usuarioLiberado();
  if (!usuario) return NextResponse.json({ error: "Sistema MEI restrito à T.I." }, { status: 403 });
  let b: { metodo?: string; caminho?: string; query?: Record<string, unknown>; corpo?: unknown; idempotencia?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const metodo = String(b.metodo ?? "GET").toUpperCase();
  const caminho = String(b.caminho ?? "");
  if (!rotaPermitida(metodo, caminho)) return NextResponse.json({ error: `Rota não permitida: ${metodo} ${caminho}` }, { status: 403 });
  const r = await chamar(metodo, caminho, { query: b.query, corpo: b.corpo, usuario, idempotencia: b.idempotencia });
  return NextResponse.json({ status: r.status, dados: r.json, dryRunForcado: !!r.dryRunForcado }, { status: 200 });
}
