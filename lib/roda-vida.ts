// Roda da Vida — acesso a dados (SERVIDOR).
//
// Privacidade combinada: cada pessoa vê a própria roda; a diretoria vê a de
// todos. Nada de RH, gestor de setor ou TI no meio. A checagem mora aqui, num
// lugar só (`podeVer`), para não se espalhar por cada rota e sair do ar sem
// ninguém notar.
//
// A tela não fala sobre esse acesso (removido a pedido em 21/09/2026) e também
// não afirma o contrário: nenhum texto promete privacidade que o sistema não
// entrega. Se um dia o individual for restrito só ao dono, dá para voltar a
// tratar disso abertamente na interface.
//
// Roda fechada não reabre. É o que sustenta a tela de evolução: se uma roda
// antiga pudesse mudar, a linha do tempo mudaria junto.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DIRETORIA_EMAILS } from "./acesso";
import { DIMENSAO_POR_ID } from "./roda-vida-conteudo";
import type { Notas } from "./roda-vida-calculo";

export * from "./roda-vida-calculo";

function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
    // Dado pessoal e transacional: nunca servir de cache do Next.
    global: { fetch: (e, i) => fetch(e, { ...i, cache: "no-store" }) },
  });
}

export function ehDiretoria(email: string | null | undefined): boolean {
  const e = email?.toLowerCase();
  return !!e && DIRETORIA_EMAILS.includes(e);
}

/** Quem pode abrir a roda de `dono`: o próprio dono e a diretoria. */
export function podeVer(quem: string | null | undefined, dono: string): boolean {
  const e = quem?.toLowerCase();
  if (!e) return false;
  return e === dono.toLowerCase() || ehDiretoria(e);
}

export interface Acao {
  id: string;
  dimensao: string;
  acao: string;
  feita: boolean;
  feita_em: string | null;
}

export interface Roda {
  id: string;
  email: string;
  criada_em: string;
  concluida_em: string | null;
  reflexao: string | null;
  notas: Notas;
  acoes: Acao[];
}

function montar(
  linha: { id: string; email: string; criada_em: string; concluida_em: string | null; reflexao: string | null },
  notas: { dimensao: string; nota: number }[],
  acoes: Acao[]
): Roda {
  return {
    ...linha,
    notas: Object.fromEntries(notas.map((n) => [n.dimensao, Number(n.nota)])),
    acoes,
  };
}

async function completarRoda(sb: SupabaseClient, linhas: Record<string, unknown>[]): Promise<Roda[]> {
  if (linhas.length === 0) return [];
  const ids = linhas.map((r) => r.id as string);

  const [{ data: notas }, { data: acoes }] = await Promise.all([
    sb.from("roda_vida_notas").select("roda_id,dimensao,nota").in("roda_id", ids),
    sb.from("roda_vida_acoes").select("id,roda_id,dimensao,acao,feita,feita_em")
      .in("roda_id", ids).order("criada_em", { ascending: true }),
  ]);

  const porRoda = new Map<string, { dimensao: string; nota: number }[]>();
  for (const n of (notas ?? []) as { roda_id: string; dimensao: string; nota: number }[]) {
    const l = porRoda.get(n.roda_id) ?? [];
    l.push({ dimensao: n.dimensao, nota: n.nota });
    porRoda.set(n.roda_id, l);
  }

  const acoesPorRoda = new Map<string, Acao[]>();
  for (const a of (acoes ?? []) as (Acao & { roda_id: string })[]) {
    const l = acoesPorRoda.get(a.roda_id) ?? [];
    l.push({ id: a.id, dimensao: a.dimensao, acao: a.acao, feita: a.feita, feita_em: a.feita_em });
    acoesPorRoda.set(a.roda_id, l);
  }

  return linhas.map((r) =>
    montar(
      r as unknown as Parameters<typeof montar>[0],
      porRoda.get(r.id as string) ?? [],
      acoesPorRoda.get(r.id as string) ?? []
    )
  );
}

/**
 * Roda em que a pessoa está trabalhando agora: o rascunho aberto, se houver;
 * senão a última concluída. Assim quem volta à tela retoma de onde parou, e
 * quem já terminou vê o resultado em vez de um formulário em branco.
 */
export async function rodaAtual(email: string): Promise<Roda | null> {
  const sb = db();
  if (!sb) return null;

  const { data: rascunho } = await sb
    .from("roda_vida").select("*").eq("email", email).is("concluida_em", null)
    .order("criada_em", { ascending: false }).limit(1);
  if (rascunho && rascunho.length > 0) {
    return (await completarRoda(sb, rascunho as Record<string, unknown>[]))[0] ?? null;
  }

  const { data: ultima } = await sb
    .from("roda_vida").select("*").eq("email", email).not("concluida_em", "is", null)
    .order("concluida_em", { ascending: false }).limit(1);
  return (await completarRoda(sb, (ultima ?? []) as Record<string, unknown>[]))[0] ?? null;
}

/** Histórico de rodas concluídas, da mais recente para a mais antiga. */
export async function historico(email: string, limite = 12): Promise<Roda[]> {
  const sb = db();
  if (!sb) return [];
  const { data } = await sb
    .from("roda_vida").select("*").eq("email", email).not("concluida_em", "is", null)
    .order("concluida_em", { ascending: false }).limit(limite);
  return completarRoda(sb, (data ?? []) as Record<string, unknown>[]);
}

export async function obterRoda(id: string): Promise<Roda | null> {
  const sb = db();
  if (!sb) return null;
  const { data } = await sb.from("roda_vida").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  return (await completarRoda(sb, [data as Record<string, unknown>]))[0] ?? null;
}

/** Cria um rascunho novo. Só um por pessoa: o aberto é reaproveitado. */
export async function abrirRoda(email: string): Promise<{ id?: string; error: string | null }> {
  const sb = db();
  if (!sb) return { error: "Banco indisponível." };

  const { data: ja } = await sb
    .from("roda_vida").select("id").eq("email", email).is("concluida_em", null).limit(1);
  if (ja && ja.length > 0) return { id: (ja[0] as { id: string }).id, error: null };

  const { data, error } = await sb
    .from("roda_vida").insert({ email }).select("id").single();
  return { id: (data as { id: string } | null)?.id, error: error?.message ?? null };
}

export async function salvarNota(
  rodaId: string, dimensao: string, nota: number
): Promise<string | null> {
  const sb = db();
  if (!sb) return "Banco indisponível.";
  if (!DIMENSAO_POR_ID[dimensao]) return "Dimensão desconhecida.";
  if (!Number.isInteger(nota) || nota < 0 || nota > 10) return "A nota vai de 0 a 10.";

  const { error } = await sb
    .from("roda_vida_notas")
    .upsert({ roda_id: rodaId, dimensao, nota }, { onConflict: "roda_id,dimensao" });
  if (error) return error.message;
  await tocar(sb, rodaId);
  return null;
}

export async function salvarReflexao(rodaId: string, texto: string | null): Promise<string | null> {
  const sb = db();
  if (!sb) return "Banco indisponível.";
  const { error } = await sb
    .from("roda_vida")
    .update({ reflexao: texto, atualizada_em: new Date().toISOString() })
    .eq("id", rodaId);
  return error?.message ?? null;
}

/**
 * Fecha a roda. Exige todas as dimensões respondidas: meia roda desenha uma
 * figura que não representa ninguém, e entraria assim no histórico.
 */
export async function concluirRoda(rodaId: string): Promise<string | null> {
  const sb = db();
  if (!sb) return "Banco indisponível.";

  const { data } = await sb.from("roda_vida_notas").select("dimensao").eq("roda_id", rodaId);
  const faltam = Object.keys(DIMENSAO_POR_ID).length - ((data ?? []) as unknown[]).length;
  if (faltam > 0) return `Faltam ${faltam} dimensão(ões) para fechar a roda.`;

  const agora = new Date().toISOString();
  const { error } = await sb
    .from("roda_vida").update({ concluida_em: agora, atualizada_em: agora }).eq("id", rodaId);
  return error?.message ?? null;
}

export async function excluirRoda(rodaId: string): Promise<string | null> {
  const sb = db();
  if (!sb) return "Banco indisponível.";
  const { error } = await sb.from("roda_vida").delete().eq("id", rodaId);
  return error?.message ?? null;
}

// ------------------------------------------------------------------ ações

export async function adicionarAcao(
  rodaId: string, dimensao: string, acao: string
): Promise<string | null> {
  const sb = db();
  if (!sb) return "Banco indisponível.";
  if (!DIMENSAO_POR_ID[dimensao]) return "Dimensão desconhecida.";

  const texto = acao.trim();
  if (!texto) return "Escreva a ação.";
  if (texto.length > 300) return "Ação muito longa.";

  const { data: ja } = await sb
    .from("roda_vida_acoes").select("id")
    .eq("roda_id", rodaId).eq("dimensao", dimensao).eq("acao", texto).limit(1);
  if (ja && ja.length > 0) return null; // já escolhida: clicar de novo não duplica

  const { error } = await sb
    .from("roda_vida_acoes").insert({ roda_id: rodaId, dimensao, acao: texto });
  if (error) return error.message;
  await tocar(sb, rodaId);
  return null;
}

export async function marcarAcao(acaoId: string, feita: boolean): Promise<string | null> {
  const sb = db();
  if (!sb) return "Banco indisponível.";
  const { error } = await sb
    .from("roda_vida_acoes")
    .update({ feita, feita_em: feita ? new Date().toISOString() : null })
    .eq("id", acaoId);
  return error?.message ?? null;
}

export async function removerAcao(acaoId: string): Promise<string | null> {
  const sb = db();
  if (!sb) return "Banco indisponível.";
  const { error } = await sb.from("roda_vida_acoes").delete().eq("id", acaoId);
  return error?.message ?? null;
}

/** Dono da roda — usado pelas rotas antes de deixar mexer. */
export async function donoDaRoda(rodaId: string): Promise<string | null> {
  const sb = db();
  if (!sb) return null;
  const { data } = await sb.from("roda_vida").select("email").eq("id", rodaId).maybeSingle();
  return (data as { email: string } | null)?.email ?? null;
}

async function tocar(sb: SupabaseClient, rodaId: string): Promise<void> {
  await sb.from("roda_vida").update({ atualizada_em: new Date().toISOString() }).eq("id", rodaId);
}

// --------------------------------------------------------------- diretoria

export interface LinhaPainel {
  email: string;
  nome: string | null;
  concluida_em: string;
  media: number;
  notas: Notas;
  acoes: number;
  acoesFeitas: number;
}

/**
 * Visão da diretoria: a última roda concluída de cada pessoa.
 *
 * Rascunho não entra — roda pela metade não é opinião de ninguém, e mostrar
 * isso a quem lidera seria injusto com quem ainda está respondendo.
 */
export async function painelDiretoria(): Promise<LinhaPainel[]> {
  const sb = db();
  if (!sb) return [];

  const { data } = await sb
    .from("roda_vida").select("*").not("concluida_em", "is", null)
    .order("concluida_em", { ascending: false });

  const linhas = (data ?? []) as Record<string, unknown>[];
  const ultimaPorPessoa = new Map<string, Record<string, unknown>>();
  for (const r of linhas) {
    const e = String(r.email).toLowerCase();
    if (!ultimaPorPessoa.has(e)) ultimaPorPessoa.set(e, r);
  }

  const rodas = await completarRoda(sb, [...ultimaPorPessoa.values()]);

  const emails = rodas.map((r) => r.email.toLowerCase());
  const nomes = new Map<string, string>();
  if (emails.length > 0) {
    const { data: p } = await sb.from("pessoas_perfil").select("email,nome").in("email", emails);
    for (const x of (p ?? []) as { email: string; nome: string }[]) {
      nomes.set(x.email.toLowerCase(), x.nome);
    }
  }

  const ids = Object.keys(DIMENSAO_POR_ID);
  return rodas.map((r) => {
    const vs = ids.map((id) => r.notas[id]).filter((v) => v !== undefined);
    const soma = vs.reduce((s, v) => s + Number(v), 0);
    return {
      email: r.email,
      nome: nomes.get(r.email.toLowerCase()) ?? null,
      concluida_em: r.concluida_em!,
      media: vs.length > 0 ? Math.round((soma / vs.length) * 10) / 10 : 0,
      notas: r.notas,
      acoes: r.acoes.length,
      acoesFeitas: r.acoes.filter((a) => a.feita).length,
    };
  }).sort((a, b) => a.media - b.media);
}
