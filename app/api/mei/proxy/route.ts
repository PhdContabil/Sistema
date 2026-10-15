import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { chamar, rotaPermitida, chavesConfiguradas, recursoDaRota } from "@/lib/mei/api";

// Proxy do Sistema MEI para a API Questor (lista branca de rotas em lib/mei/api.ts).
// POST { metodo, caminho, query?, corpo?, idempotencia? }. GET devolve o estado das chaves.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function usuarioLiberado() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return podeAcessarApp(nivel, "mei", "Sistema MEI") ? (user?.email ?? "desconhecido") : null;
}

/** Usuários (responsáveis) do MEI: setor MEI, T.I. e Diretoria gravam (quem tem acesso ao Sistema MEI). */
async function ehAdmin() {
  return !!(await usuarioLiberado());
}

export async function GET() {
  if (!(await usuarioLiberado())) return NextResponse.json({ error: "Sem acesso ao Sistema MEI (setor MEI, Diretoria ou T.I.)." }, { status: 403 });
  return NextResponse.json({ ...chavesConfiguradas(), podeUsuarios: await ehAdmin() });
}

export async function POST(req: Request) {
  const usuario = await usuarioLiberado();
  if (!usuario) return NextResponse.json({ error: "Sem acesso ao Sistema MEI (setor MEI, Diretoria ou T.I.)." }, { status: 403 });
  let b: { metodo?: string; caminho?: string; query?: Record<string, unknown>; corpo?: unknown; idempotencia?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const metodo = String(b.metodo ?? "GET").toUpperCase();
  const caminho = String(b.caminho ?? "");
  if (!rotaPermitida(metodo, caminho)) return NextResponse.json({ error: `Rota não permitida: ${metodo} ${caminho}` }, { status: 403 });
  let liberar = false;
  if (metodo !== "GET" && recursoDaRota(caminho) === "usuarios") {
    if (!(await ehAdmin())) return NextResponse.json({ error: "Sem permissão para alterar os usuários do MEI." }, { status: 403 });
    liberar = true;
  }
  const r = await chamar(metodo, caminho, { query: b.query, corpo: b.corpo, usuario, idempotencia: b.idempotencia, liberar });
  return NextResponse.json({ status: r.status, dados: r.json, dryRunForcado: !!r.dryRunForcado }, { status: 200 });
}
