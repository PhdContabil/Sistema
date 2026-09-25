// DARE SP — acesso a dados (SERVIDOR).
//
// A tela não consulta a Questor a cada abertura: sincroniza para o Supabase e
// lê de lá. Motivo: o débito ganha estado nosso — vencimento corrigido à mão,
// guia emitida, envio ao Zen — e estado não cabe numa view de leitura.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getIcmsCompetencia } from "./questor";
import { vencimentoSugerido, competenciaOrdenavel } from "./dare-sp-calculo";

export * from "./dare-sp-calculo";

function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
    // Dado transacional: nunca servir do Data Cache do Next.
    global: { fetch: (e, i) => fetch(e, { ...i, cache: "no-store" }) },
  });
}

export interface Debito {
  codigoempresa: number;
  codigoestab: number;
  competencia: string;
  codigoimposto: string;
  cnpj: string | null;
  nome: string | null;
  valor: number;
  vencimento: string | null;
  vencimento_manual: boolean;
  sincronizado_em: string;
  /** Guias já emitidas para este débito, da mais recente para a mais antiga. */
  guias: GuiaResumo[];
}

export interface GuiaResumo {
  id: string;
  total: number;
  data_pagamento: string;
  numero_controle: string | null;
  linha_digitavel: string | null;
  zen_documento_id: string | null;
  zen_enviado_em: string | null;
  emitida_em: string;
  emitida_por: string | null;
}

export interface Contribuinte {
  cnpj: string;
  razao_social: string | null;
  endereco: string;
  cidade: string;
  uf: string;
  telefone: string | null;
}

// ------------------------------------------------------------ sincronização

export interface ResultadoSync {
  lidos: number;
  gravados: number;
  competencias: string[];
  /**
   * Campos que vieram da API e não reconhecemos. Serve de alarme se o contrato
   * mudar — melhor aparecer aqui do que virar coluna vazia na tela.
   */
  camposDesconhecidos: string[];
}

const CAMPOS_ESPERADOS = new Set([
  "codigoempresa", "codigoestab", "cnpj", "nome",
  "competencia", "codigoimposto", "valor",
]);

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * Puxa o ICMS da Questor e grava no Supabase.
 *
 * Upsert pela mesma chave da view: resincronizar a competência atualiza os
 * valores em vez de duplicar. O vencimento corrigido à mão é preservado —
 * sincronizar não pode desfazer o que alguém conferiu.
 */
export async function sincronizar(params: {
  competencia?: string;
  ano?: number;
  meses?: number;
}): Promise<ResultadoSync> {
  const sb = db();
  if (!sb) throw new Error("Banco indisponível.");

  const resp = await getIcmsCompetencia({ ...params, incluir_zerados: false });
  const linhas = (resp?.dados ?? []) as unknown as Record<string, unknown>[];

  const desconhecidos = new Set<string>();
  for (const l of linhas.slice(0, 5)) {
    for (const k of Object.keys(l)) if (!CAMPOS_ESPERADOS.has(k)) desconhecidos.add(k);
  }

  if (linhas.length === 0) {
    return { lidos: 0, gravados: 0, competencias: [], camposDesconhecidos: [...desconhecidos] };
  }

  // O que já está gravado com vencimento corrigido à mão, para não sobrescrever.
  const chaves = linhas.map((l) => ({
    codigoempresa: num(l.codigoempresa),
    codigoestab: num(l.codigoestab),
    competencia: String(l.competencia ?? ""),
    codigoimposto: String(l.codigoimposto ?? ""),
  }));
  const comps = [...new Set(chaves.map((c) => c.competencia))].filter(Boolean);

  const { data: jaTem } = await sb
    .from("dare_sp_debitos")
    .select("codigoempresa,codigoestab,competencia,codigoimposto,vencimento,vencimento_manual")
    .in("competencia", comps.length > 0 ? comps : [""]);

  const manuais = new Map<string, string | null>();
  for (const d of (jaTem ?? []) as {
    codigoempresa: number; codigoestab: number; competencia: string;
    codigoimposto: string; vencimento: string | null; vencimento_manual: boolean;
  }[]) {
    if (d.vencimento_manual) {
      manuais.set(`${d.codigoempresa}|${d.codigoestab}|${d.competencia}|${d.codigoimposto}`, d.vencimento);
    }
  }

  const agora = new Date().toISOString();
  const lote = linhas.map((l) => {
    const competencia = String(l.competencia ?? "");
    const codigoimposto = String(l.codigoimposto ?? "");
    const codigoempresa = num(l.codigoempresa);
    const codigoestab = num(l.codigoestab);
    const chave = `${codigoempresa}|${codigoestab}|${competencia}|${codigoimposto}`;
    const manual = manuais.get(chave);

    return {
      codigoempresa,
      codigoestab,
      competencia,
      codigoimposto,
      cnpj: texto(l.cnpj)?.replace(/\D/g, "") ?? null,
      nome: texto(l.nome),
      valor: num(l.valor),
      vencimento: manual ?? vencimentoSugerido(competencia, codigoimposto),
      vencimento_manual: manual !== undefined,
      sincronizado_em: agora,
    };
  });

  // Em blocos: uma competência do escritório inteiro passa de mil linhas.
  let gravados = 0;
  for (let i = 0; i < lote.length; i += 500) {
    const { error } = await sb
      .from("dare_sp_debitos")
      .upsert(lote.slice(i, i + 500), {
        onConflict: "codigoempresa,codigoestab,competencia,codigoimposto",
      });
    if (error) throw new Error(error.message);
    gravados += lote.slice(i, i + 500).length;
  }

  return {
    lidos: linhas.length,
    gravados,
    competencias: comps.sort(),
    camposDesconhecidos: [...desconhecidos],
  };
}

// ------------------------------------------------------------------ leitura

export async function listarDebitos(competencia?: string): Promise<Debito[]> {
  const sb = db();
  if (!sb) return [];

  let q = sb.from("dare_sp_debitos").select("*").order("nome", { ascending: true });
  if (competencia) q = q.eq("competencia", competencia);
  const { data } = await q.limit(2000);

  const debitos = (data ?? []) as Omit<Debito, "guias">[];
  if (debitos.length === 0) return [];

  const comps = [...new Set(debitos.map((d) => d.competencia))];
  const { data: guias } = await sb
    .from("dare_sp_guias")
    .select("id,codigoempresa,codigoestab,competencia,codigoimposto,total,data_pagamento,numero_controle,linha_digitavel,zen_documento_id,zen_enviado_em,emitida_em,emitida_por")
    .in("competencia", comps)
    .order("emitida_em", { ascending: false });

  const porDebito = new Map<string, GuiaResumo[]>();
  for (const g of (guias ?? []) as (GuiaResumo & {
    codigoempresa: number; codigoestab: number; competencia: string; codigoimposto: string;
  })[]) {
    const k = `${g.codigoempresa}|${g.codigoestab}|${g.competencia}|${g.codigoimposto}`;
    const lista = porDebito.get(k) ?? [];
    lista.push(g);
    porDebito.set(k, lista);
  }

  return debitos.map((d) => ({
    ...d,
    valor: Number(d.valor),
    guias: porDebito.get(`${d.codigoempresa}|${d.codigoestab}|${d.competencia}|${d.codigoimposto}`) ?? [],
  }));
}

/** Competências já sincronizadas, da mais recente para a mais antiga. */
export async function competenciasDisponiveis(): Promise<string[]> {
  const sb = db();
  if (!sb) return [];
  const { data } = await sb.from("dare_sp_debitos").select("competencia").limit(5000);
  const todas = [...new Set(((data ?? []) as { competencia: string }[]).map((d) => d.competencia))];
  return todas.sort((a, b) => competenciaOrdenavel(b).localeCompare(competenciaOrdenavel(a)));
}

export async function obterDebito(
  codigoempresa: number, codigoestab: number, competencia: string, codigoimposto: string
): Promise<Debito | null> {
  const sb = db();
  if (!sb) return null;
  const { data } = await sb
    .from("dare_sp_debitos").select("*")
    .eq("codigoempresa", codigoempresa).eq("codigoestab", codigoestab)
    .eq("competencia", competencia).eq("codigoimposto", codigoimposto)
    .maybeSingle();
  if (!data) return null;
  const d = data as Omit<Debito, "guias">;
  return { ...d, valor: Number(d.valor), guias: [] };
}

export async function definirVencimento(
  codigoempresa: number, codigoestab: number, competencia: string, codigoimposto: string,
  vencimento: string
): Promise<string | null> {
  const sb = db();
  if (!sb) return "Banco indisponível.";
  const { error } = await sb
    .from("dare_sp_debitos")
    .update({ vencimento, vencimento_manual: true })
    .eq("codigoempresa", codigoempresa).eq("codigoestab", codigoestab)
    .eq("competencia", competencia).eq("codigoimposto", codigoimposto);
  return error?.message ?? null;
}

// ------------------------------------------------------------ contribuinte

export async function obterContribuinte(cnpj: string): Promise<Contribuinte | null> {
  const sb = db();
  if (!sb) return null;
  const { data } = await sb
    .from("dare_sp_contribuinte").select("*")
    .eq("cnpj", (cnpj ?? "").replace(/\D/g, "")).maybeSingle();
  return (data as Contribuinte) ?? null;
}

/**
 * Grava o endereço ANTES de emitir.
 *
 * Se a Sefaz recusar por outro motivo, quem digitou não perde o que escreveu.
 */
export async function salvarContribuinte(
  c: Contribuinte, por: string
): Promise<string | null> {
  const sb = db();
  if (!sb) return "Banco indisponível.";
  const { error } = await sb.from("dare_sp_contribuinte").upsert(
    {
      cnpj: (c.cnpj ?? "").replace(/\D/g, ""),
      razao_social: c.razao_social ?? null,
      endereco: c.endereco,
      cidade: c.cidade,
      uf: c.uf || "SP",
      telefone: c.telefone ?? null,
      atualizado_por: por,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "cnpj" }
  );
  return error?.message ?? null;
}

// ------------------------------------------------------------------- guias

export interface GuiaGravada {
  id: string;
  codigoempresa: number;
  codigoestab: number;
  competencia: string;
  codigoimposto: string;
  cnpj: string;
  nome: string | null;
  principal: number;
  multa: number;
  juros: number;
  total: number;
  vencimento: string;
  data_pagamento: string;
  receita_codigo: string | null;
  receita_servico: number | null;
  numero_controle: string | null;
  codigo_barras: string | null;
  linha_digitavel: string | null;
  pix: string | null;
  pdf_base64: string | null;
  total_sefaz: number | null;
}

export async function gravarGuia(
  g: Omit<GuiaGravada, "id">, por: string
): Promise<{ id?: string; error: string | null }> {
  const sb = db();
  if (!sb) return { error: "Banco indisponível." };
  const { data, error } = await sb
    .from("dare_sp_guias")
    .insert({ ...g, emitida_por: por })
    .select("id")
    .single();
  return { id: (data as { id: string } | null)?.id, error: error?.message ?? null };
}

export async function marcarEnvioZen(
  guiaId: string, documentoId: string
): Promise<string | null> {
  const sb = db();
  if (!sb) return "Banco indisponível.";
  const { error } = await sb
    .from("dare_sp_guias")
    .update({ zen_documento_id: documentoId, zen_enviado_em: new Date().toISOString() })
    .eq("id", guiaId);
  return error?.message ?? null;
}

export async function obterGuia(id: string): Promise<GuiaGravada | null> {
  const sb = db();
  if (!sb) return null;
  const { data } = await sb.from("dare_sp_guias").select("*").eq("id", id).maybeSingle();
  return (data as GuiaGravada) ?? null;
}
