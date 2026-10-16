import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { supabaseAdmin } from "@/lib/societario/supabase";

// Dados do cliente MEI que existem só no Núcleo (não vão para o Questor): nome social.
// Tabela mei_cliente_extra no Supabase (docs/mei-extra-migration.sql).
// GET ?cod=123   POST { codigoempresa, nome_social }
export const dynamic = "force-dynamic";

async function usuario() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return podeAcessarApp(nivel, "mei", "Sistema MEI") ? (user?.email ?? "desconhecido") : null;
}
const semAcesso = () => NextResponse.json({ error: "Sem acesso ao Sistema MEI (setor MEI, Diretoria ou T.I.)." }, { status: 403 });

export async function GET(req: Request) {
  if (!(await usuario())) return semAcesso();
  const cod = Number(new URL(req.url).searchParams.get("cod"));
  let q = supabaseAdmin().from("mei_cliente_extra").select("*");
  if (cod) q = q.eq("codigoempresa", cod);
  const { data, error } = await q.limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ dados: data ?? [] });
}

export async function POST(req: Request) {
  const email = await usuario();
  if (!email) return semAcesso();
  let b: { codigoempresa?: number; nome_social?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const cod = Number(b.codigoempresa);
  if (!cod) return NextResponse.json({ error: "Informe o código do MEI." }, { status: 400 });
  const nome = String(b.nome_social ?? "").trim().slice(0, 150) || null;
  const { data, error } = await supabaseAdmin().from("mei_cliente_extra")
    .upsert({ codigoempresa: cod, nome_social: nome, atualizado_em: new Date().toISOString(), atualizado_por: email }, { onConflict: "codigoempresa" })
    .select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, dados: data });
}
