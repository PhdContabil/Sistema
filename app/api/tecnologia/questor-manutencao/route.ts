import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { ehDaTI } from "@/lib/tickets";

export const dynamic = "force-dynamic";

// Chave de ADMIN da API Questor — distinta da chave de leitura (QUESTOR_API_KEY)
// usada pelo resto do sistema. Só existe no servidor; a tela em
// /m/tecnologia/catalogo nunca a vê, só o resultado da chamada.
//
// Busca na mesma ordem das credenciais do Graph: variável de ambiente e,
// se não houver, a tabela app_config (RLS sem política — só a service role
// enxerga). Assim a chave pode ser trocada sem redeploy.
const BASE = process.env.QUESTOR_API_URL ?? "https://phdfibra.dyndns.org";

let cache: { chave: string; em: number } | null = null;
const TTL = 5 * 60 * 1000;

async function obterChaveAdmin(): Promise<string | null> {
  if (process.env.QUESTOR_ADMIN_KEY) return process.env.QUESTOR_ADMIN_KEY;
  if (cache && Date.now() - cache.em < TTL) return cache.chave;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svc) return null;

  try {
    const sb = createClient(url, svc, { auth: { persistSession: false } });
    const { data } = await sb
      .from("app_config").select("valor").eq("chave", "QUESTOR_ADMIN_KEY").maybeSingle();
    const chave = data?.valor as string | undefined;
    if (!chave) return null;
    cache = { chave, em: Date.now() };
    return chave;
  } catch {
    return null;
  }
}

async function exigirTI() {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return { ok: false as const, resp: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  if (!(await ehDaTI(email))) {
    return {
      ok: false as const,
      resp: NextResponse.json({ error: "Só pessoas do setor de TI podem operar a API." }, { status: 403 }),
    };
  }
  return { ok: true as const, email };
}

/** Estado atual da API (ligada/desligada). */
export async function GET() {
  const guarda = await exigirTI();
  if (!guarda.ok) return guarda.resp;
  const ADMIN_KEY = await obterChaveAdmin();
  if (!ADMIN_KEY) return NextResponse.json({ error: "Chave admin da API Questor não encontrada." }, { status: 500 });

  try {
    const r = await fetch(`${BASE}/admin/status`, {
      headers: { "X-Admin-Key": ADMIN_KEY },
      cache: "no-store",
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) return NextResponse.json({ error: dados?.detail ?? `Erro ${r.status}` }, { status: r.status });
    return NextResponse.json(dados);
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar a API Questor (rede)." }, { status: 502 });
  }
}

/** Liga ou desliga a API. Body: { ativo: boolean, motivo?: string } */
export async function POST(req: Request) {
  const guarda = await exigirTI();
  if (!guarda.ok) return guarda.resp;
  const ADMIN_KEY = await obterChaveAdmin();
  if (!ADMIN_KEY) return NextResponse.json({ error: "Chave admin da API Questor não encontrada." }, { status: 500 });

  let body: { ativo?: boolean; motivo?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (typeof body.ativo !== "boolean") {
    return NextResponse.json({ error: "Informe { ativo: true|false }." }, { status: 400 });
  }

  const q = new URLSearchParams({ ativo: String(body.ativo) });
  if (body.ativo && body.motivo) q.set("motivo", body.motivo);

  try {
    const r = await fetch(`${BASE}/admin/manutencao?${q.toString()}`, {
      method: "POST",
      headers: { "X-Admin-Key": ADMIN_KEY },
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) return NextResponse.json({ error: dados?.detail ?? `Erro ${r.status}` }, { status: r.status });
    return NextResponse.json({ ok: true, ...dados, acionado_por: guarda.email });
  } catch {
    return NextResponse.json({ error: "Não foi possível falar com a API Questor (rede)." }, { status: 502 });
  }
}
