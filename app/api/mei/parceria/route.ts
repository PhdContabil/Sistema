import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { supabaseAdmin } from "@/lib/societario/supabase";

// Contrato de parceria (Lei Salão-Parceiro) de cada profissional MEI: modelo do Sindicato
// e situação da homologação. Tabela mei_parceria no Supabase (docs/mei-parceria-migration.sql).
// GET ?cod=123 (um) ou sem cod (todos)   POST { codigoempresa, modelo, situacao, protocolo, data_envio, data_homologacao, obs }
export const dynamic = "force-dynamic";

const SITUACOES = ["Pendente", "Enviado", "Homologado", "Recusado", "Não se aplica"];

async function usuario() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return podeAcessarApp(nivel, "mei", "Sistema MEI") ? (user?.email ?? "desconhecido") : null;
}
const semAcesso = () => NextResponse.json({ error: "Sem acesso ao Sistema MEI (setor MEI, Diretoria ou T.I.)." }, { status: 403 });

export async function GET(req: Request) {
  if (!(await usuario())) return semAcesso();
  const cod = Number(new URL(req.url).searchParams.get("cod"));
  let q = supabaseAdmin().from("mei_parceria").select("*");
  if (cod) q = q.eq("codigoempresa", cod);
  const { data, error } = await q.limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ dados: data ?? [] });
}

export async function POST(req: Request) {
  const email = await usuario();
  if (!email) return semAcesso();
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const cod = Number(b.codigoempresa);
  if (!cod) return NextResponse.json({ error: "Informe o código do MEI." }, { status: 400 });
  const txt = (v: unknown, max = 300) => { const s = String(v ?? "").trim(); return s ? s.slice(0, max) : null; };
  const data = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
  const situacao = SITUACOES.includes(String(b.situacao)) ? String(b.situacao) : "Pendente";
  const linha = {
    codigoempresa: cod, modelo: txt(b.modelo), situacao, protocolo: txt(b.protocolo, 100),
    data_envio: data(b.data_envio), data_homologacao: data(b.data_homologacao), obs: txt(b.obs, 2000),
    atualizado_em: new Date().toISOString(), atualizado_por: email,
  };
  const { data: salvo, error } = await supabaseAdmin().from("mei_parceria").upsert(linha, { onConflict: "codigoempresa" }).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, dados: salvo });
}
