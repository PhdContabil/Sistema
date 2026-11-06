import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso } from "@/lib/acesso";
import { lerTermos, salvarTermos, novoToken, sb, type Termo } from "@/lib/inventario-termos";

// Termos de empréstimo de equipamento — só T.I./Diretoria (mesma regra do Inventário).
export const dynamic = "force-dynamic";
const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://system-contabilidade.vercel.app";

async function quem() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return nivel.acessoTotal ? (user?.email ?? "ti") : null;
}

/** Lista os termos (sem a imagem da assinatura) e as pessoas do cadastro, para escolher a quem atrelar. */
export async function GET() {
  if (!(await quem())) return NextResponse.json({ error: "Apenas T.I./Diretoria." }, { status: 403 });
  const termos = (await lerTermos()).map((t) => ({ ...t, assinatura: t.assinatura ? { ...t.assinatura, imagem: "" } : null, link: `${BASE}/termo/${t.token}` }));
  const { data: pessoas } = (await sb()?.from("pessoas_perfil").select("id,nome,email,setor").order("nome")) ?? { data: [] };
  return NextResponse.json({ termos, pessoas: pessoas ?? [] });
}

/** Gera um termo para um item do inventário e devolve o link de assinatura. */
export async function POST(req: Request) {
  const email = await quem();
  if (!email) return NextResponse.json({ error: "Apenas T.I./Diretoria." }, { status: 403 });
  let b: { item_id?: number; nome?: string; email?: string; setor?: string; cpf?: string; pessoa_id?: number | null; acessorios?: string; condicao?: string; identificacao?: string; data_entrega?: string; devolucao_prevista?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const nome = String(b.nome ?? "").trim();
  if (!b.item_id || !nome) return NextResponse.json({ error: "Informe o equipamento e a pessoa." }, { status: 400 });

  const { data: item } = (await sb()?.from("inventario_ti").select("id,item,marca,especificacao").eq("id", b.item_id).maybeSingle()) ?? { data: null };
  if (!item) return NextResponse.json({ error: "Equipamento não encontrado no inventário." }, { status: 404 });

  const lista = await lerTermos();
  if (lista.some((t) => t.equipamento.item_id === item.id && t.status === "pendente")) {
    return NextResponse.json({ error: "Já existe um termo aguardando assinatura para este equipamento. Cancele-o antes de gerar outro." }, { status: 409 });
  }
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const t: Termo = {
    id: lista.reduce((m, x) => Math.max(m, x.id), 0) + 1,
    token: novoToken(),
    status: "pendente",
    equipamento: { item_id: item.id, item: item.item, marca: item.marca, especificacao: item.especificacao, observacao: String(b.identificacao ?? "").trim() || null },
    acessorios: String(b.acessorios ?? "").trim() || null,
    condicao: String(b.condicao ?? "").trim() || null,
    colaborador: { nome, email: String(b.email ?? "").trim().toLowerCase() || null, setor: String(b.setor ?? "").trim() || null, cpf: String(b.cpf ?? "").replace(/\D/g, "") || null, pessoa_id: b.pessoa_id ?? null },
    data_entrega: /^\d{4}-\d{2}-\d{2}$/.test(String(b.data_entrega)) ? String(b.data_entrega) : hoje,
    devolucao_prevista: /^\d{4}-\d{2}-\d{2}$/.test(String(b.devolucao_prevista)) ? String(b.devolucao_prevista) : null,
    criado_por: email,
    criado_em: new Date().toISOString(),
    assinatura: null,
    devolvido_em: null,
    devolucao_obs: null,
  };
  const erro = await salvarTermos([...lista, t]);
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });
  return NextResponse.json({ ok: true, id: t.id, link: `${BASE}/termo/${t.token}` });
}
