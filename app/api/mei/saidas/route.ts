import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { supabaseAdmin } from "@/lib/societario/supabase";

// Saídas (encerramentos) feitas pelo Núcleo: guarda QUANDO o encerramento foi lançado,
// para o painel contar a saída no mês do lançamento (a data de encerramento costuma ser
// retroativa ou futura). Arquivo JSON no bucket privado cache-nucleo — sem tabela nova.
// GET -> { dados: [{ cod, lancada_em, data_encerramento, por }] }
// POST { cod, data_encerramento }
export const dynamic = "force-dynamic";

const BUCKET = "cache-nucleo";
const ARQ = "mei-saidas.json";
interface Saida { cod: number; lancada_em: string; data_encerramento: string; por: string }

async function usuario() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return podeAcessarApp(nivel, "mei", "Sistema MEI") ? (user?.email ?? "desconhecido") : null;
}
const semAcesso = () => NextResponse.json({ error: "Sem acesso ao Sistema MEI." }, { status: 403 });

async function ler(): Promise<Saida[]> {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(ARQ);
  if (error || !data) return [];
  try { const j = JSON.parse(await data.text()); return Array.isArray(j) ? j : []; } catch { return []; }
}

export async function GET() {
  if (!(await usuario())) return semAcesso();
  return NextResponse.json({ dados: await ler() });
}

export async function POST(req: Request) {
  const email = await usuario();
  if (!email) return semAcesso();
  let b: { cod?: number; data_encerramento?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const cod = Number(b.cod); const data = String(b.data_encerramento ?? "");
  if (!cod || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return NextResponse.json({ error: "Informe cod e data_encerramento." }, { status: 400 });
  // Um registro por MEI (vale o último encerramento).
  const lista = (await ler()).filter((s) => s.cod !== cod);
  lista.push({ cod, lancada_em: new Date().toISOString(), data_encerramento: data, por: email });
  const { error } = await supabaseAdmin().storage.from(BUCKET)
    .upload(ARQ, new Blob([JSON.stringify(lista)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
