import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { supabaseAdmin } from "@/lib/societario/supabase";

// Paralegal · Controle — serviços digitados em "Outro (especificar)" na O.S.
// Ficam salvos para aparecer na lista nas próximas vezes. Sem duplicar: "Cancelamento Filial",
// "cancelamento filial" e "CANCELAMENTO FILIAL" contam como o mesmo (vale o 1º jeito salvo).
// JSON no bucket privado "cache-nucleo".
export const dynamic = "force-dynamic";
const BUCKET = "cache-nucleo";
const ARQ = "paralegal-servicos-extras.json";

const chave = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

async function autorizado() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return podeAcessarApp(nivel, "paralegal", "Controle");
}

async function ler(): Promise<string[]> {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(ARQ);
  if (error || !data) return [];
  try { const j = JSON.parse(await data.text()); return Array.isArray(j) ? j.map(String) : []; } catch { return []; }
}

export async function GET() {
  if (!(await autorizado())) return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });
  return NextResponse.json({ itens: await ler() });
}

export async function POST(req: Request) {
  if (!(await autorizado())) return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });
  let b: { nomes?: string[] };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const lista = await ler();
  const existentes = new Set(lista.map(chave));
  let novos = 0;
  for (const n0 of b.nomes ?? []) {
    const n = String(n0 || "").replace(/\s+/g, " ").trim().slice(0, 150);
    if (n.length < 2 || existentes.has(chave(n))) continue;
    lista.push(n);
    existentes.add(chave(n));
    novos++;
  }
  if (novos) {
    lista.sort((a, c) => a.localeCompare(c, "pt-BR"));
    const { error } = await supabaseAdmin().storage.from(BUCKET)
      .upload(ARQ, new Blob([JSON.stringify(lista)], { type: "application/json" }), { upsert: true, contentType: "application/json", cacheControl: "0" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, novos, itens: lista });
}
