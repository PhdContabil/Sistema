import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { ehDaTI } from "@/lib/tickets";

export const dynamic = "force-dynamic";

// Chave de ADMIN da API Questor — distinta da chave de leitura (QUESTOR_API_KEY)
// usada pelo resto do sistema. Só existe no servidor; a tela em
// /m/tecnologia/catalogo nunca a vê, só o resultado da chamada.
const BASE = process.env.QUESTOR_API_URL ?? "https://phdfibra.dyndns.org";
const ADMIN_KEY = process.env.QUESTOR_ADMIN_KEY;

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
  if (!ADMIN_KEY) return NextResponse.json({ error: "QUESTOR_ADMIN_KEY não configurada no servidor." }, { status: 500 });

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
  if (!ADMIN_KEY) return NextResponse.json({ error: "QUESTOR_ADMIN_KEY não configurada no servidor." }, { status: 500 });

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
