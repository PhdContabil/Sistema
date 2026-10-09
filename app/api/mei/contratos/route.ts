import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { supabaseAdmin } from "@/lib/societario/supabase";
import { gravacaoLiberada } from "@/lib/mei/api";

// Contratos PHD do Sistema MEI (tabelas mei_contrato / mei_contrato_modelo no Supabase).
// GET ?tipo=modelos|contratos&de=&ate=&q=   POST {tabela, dados}
export const dynamic = "force-dynamic";

async function usuario() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return podeAcessarApp(nivel, "mei", "Sistema MEI") ? (user?.email ?? "desconhecido") : null;
}
const TABELAS: Record<string, string> = { modelos: "mei_contrato_modelo", contratos: "mei_contrato" };

export async function GET(req: Request) {
  if (!(await usuario())) return NextResponse.json({ error: "Sistema MEI restrito à T.I." }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const tabela = TABELAS[sp.get("tipo") ?? "contratos"];
  if (!tabela) return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
  let q = supabaseAdmin().from(tabela).select("*").order("codigo", { ascending: false });
  if (tabela === "mei_contrato") {
    if (sp.get("de")) q = q.gte("data_inicio", sp.get("de")!);
    if (sp.get("ate")) q = q.lte("data_inicio", sp.get("ate")!);
  }
  const { data, error } = await q;
  if (error) {
    const falta = /does not exist|schema cache/i.test(error.message);
    return NextResponse.json({ error: falta ? "As tabelas de contratos ainda não foram criadas no Supabase (rodar migration_mei_contratos.sql)." : error.message }, { status: falta ? 503 : 500 });
  }
  return NextResponse.json({ dados: data ?? [] });
}

export async function POST(req: Request) {
  const email = await usuario();
  if (!email) return NextResponse.json({ error: "Sistema MEI restrito à T.I." }, { status: 403 });
  let b: { tipo?: string; acao?: "criar" | "alterar" | "excluir"; codigo?: number; dados?: Record<string, unknown> };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const tabela = TABELAS[b.tipo ?? ""];
  if (!tabela || !b.acao) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  const permitidos = tabela === "mei_contrato"
    ? ["codigoempresa", "codigoestab", "codigosocio", "modelo_codigo", "contrato", "data_emissao", "data_inicio", "data_assinado"]
    : ["modelo", "conteudo", "ativo"];
  const dados = Object.fromEntries(Object.entries(b.dados ?? {}).filter(([k]) => permitidos.includes(k)));
  if (!gravacaoLiberada("contratos")) return NextResponse.json({ simulacao: true, acao: b.acao, tabela, dados: { ...dados, codigo: b.codigo } });
  const db = supabaseAdmin().from(tabela);
  const agora = new Date().toISOString();
  const r = b.acao === "criar"
    ? await db.insert({ ...dados, criado_por: email }).select().single()
    : b.acao === "alterar"
      ? await db.update({ ...dados, atualizado_em: agora, atualizado_por: email }).eq("codigo", b.codigo!).select().single()
      : await db.delete().eq("codigo", b.codigo!).select().single();
  if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  return NextResponse.json({ simulacao: false, registro: r.data });
}
