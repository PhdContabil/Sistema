// Log do Informe de Rendimentos (SERVIDOR) — Supabase, tabela
// informe_rendimentos_log (docs/informe-rendimentos-migration.sql).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import type { EntradaInforme, PlanoInforme } from "./informe-rendimentos";
import { ehStatusAtivo, linhasDaResposta, STATUS_ATIVOS } from "./informe-rendimentos-alteracao";

function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: (e, i) => fetch(e, { ...i, cache: "no-store" }) },
  });
}

export interface LinhaLog {
  id: number;
  criado_em: string;
  codigoempresa: number;
  nome_empresa: string | null;
  competencia: string;
  tipo: string;
  regime: string | null;
  rendimento: number;
  demais_receitas: number;
  dividendos: number;
  retencao: number;
  pis: number;
  cofins: number;
  /**
   * lancado/alterado = vale no Questor; alterado_depois/excluido_depois = foi
   * substituído ou apagado depois; excluido = registro da exclusão.
   */
  status: StatusInforme;
  responsavel: string;
  erro: string | null;
  origem?: "nucleo" | "access";
  teste?: boolean;
  /** Calculado no servidor: dá para alterar/excluir pela tela? (a resposta bruta da API não vai ao navegador) */
  editavel?: boolean;
}

export type StatusInforme = "lancado" | "alterado" | "alterado_depois" | "excluido" | "excluido_depois" | "erro";

/**
 * Chave de idempotência: mesma empresa, competência, regime e valores = mesma
 * chave. Clicar duas vezes (ou recarregar e reenviar) não duplica o lançamento
 * — coisa que o DMax do Access não impedia.
 */
export function chaveIdempotencia(e: EntradaInforme, regime: string): string {
  const v = [e.rendimento, e.demaisReceitas, e.dividendos, e.retencao].map((n) => n.toFixed(2)).join("|");
  const h = createHash("sha1").update(`${e.tipo}|${e.codigoempresa}|${e.competencia}|${regime}|${v}`).digest("hex").slice(0, 20);
  return `informe:${e.codigoempresa}:${e.competencia}:${h}`;
}

export const comGeracao = (base: string, geracao: number) => `${base}:g${geracao}`;

const filtroChave = (base: string) => `idempotency_key.eq.${base},idempotency_key.like.${base}:g*`;

/**
 * Geração do lançamento: quantas vezes este mesmo informe (mesma chave base) já
 * foi lançado e depois excluído. A API do Questor devolve a resposta guardada
 * quando a Idempotency-Key se repete, então lançar de novo depois de excluir
 * precisa de uma chave nova — senão não grava nada.
 */
export async function geracaoLancamento(base: string): Promise<number> {
  const sb = db();
  if (!sb) return 0;
  const { count, error } = await sb
    .from("informe_rendimentos_log").select("id", { count: "exact", head: true })
    .or(filtroChave(base)).eq("status", "excluido_depois");
  if (error) { console.error("[informe-rendimentos/log]", error.message); return 0; }
  return count ?? 0;
}

/** Já existe lançamento ativo com esta chave base (qualquer geração)? (Barra o reenvio antes de chamar a API.) */
export async function jaLancado(base: string): Promise<LinhaLog | null> {
  const sb = db();
  if (!sb) return null;
  const { data } = await sb
    .from("informe_rendimentos_log").select("*")
    .or(filtroChave(base)).in("status", [...STATUS_ATIVOS]).limit(1).maybeSingle();
  return (data as LinhaLog | null) ?? null;
}

/** Linha do log com a resposta da API (usada para achar os `seq` ao alterar/excluir). */
export async function buscarLinha(id: number): Promise<(LinhaLog & { resposta: unknown }) | null> {
  const sb = db();
  if (!sb) return null;
  const { data } = await sb.from("informe_rendimentos_log").select("*").eq("id", id).maybeSingle();
  return (data as (LinhaLog & { resposta: unknown }) | null) ?? null;
}

/** Marca uma linha como substituída/excluída depois. Só mexe se ela ainda estava ativa. */
export async function marcarLinha(id: number, status: "alterado_depois" | "excluido_depois"): Promise<boolean> {
  const sb = db();
  if (!sb) return false;
  const { data, error } = await sb.from("informe_rendimentos_log").update({ status })
    .eq("id", id).in("status", [...STATUS_ATIVOS]).select("id");
  if (error) { console.error("[informe-rendimentos/log]", error.message); return false; }
  return (data?.length ?? 0) > 0;
}

export async function registrarLog(l: {
  entrada: EntradaInforme; plano: PlanoInforme; nomeEmpresa: string | null;
  status: "lancado" | "alterado" | "excluido" | "erro"; responsavel: string; chave: string;
  resposta?: unknown; erro?: string | null;
}): Promise<void> {
  const sb = db();
  if (!sb) return;
  const { error } = await sb.from("informe_rendimentos_log").insert({
    codigoempresa: l.entrada.codigoempresa,
    nome_empresa: l.nomeEmpresa,
    competencia: l.entrada.competencia,
    tipo: l.entrada.tipo,
    regime: l.plano.regime,
    rendimento: l.entrada.rendimento,
    demais_receitas: l.entrada.demaisReceitas,
    dividendos: l.entrada.dividendos,
    retencao: l.entrada.retencao,
    pis: l.plano.totais.pis,
    cofins: l.plano.totais.cofins,
    status: l.status,
    responsavel: l.responsavel,
    idempotency_key: l.chave,
    resposta: l.resposta ?? null,
    erro: l.erro ?? null,
  });
  // O log não pode derrubar um lançamento que já foi gravado no Questor.
  if (error) console.error("[informe-rendimentos/log]", error.message);
}

export async function listarLog(limite = 1000): Promise<LinhaLog[]> {
  const sb = db();
  if (!sb) return [];
  const { data, error } = await sb
    .from("informe_rendimentos_log").select("*")
    .order("criado_em", { ascending: false }).limit(limite);
  if (error) throw new Error(`Falha ao ler o log: ${error.message}`);
  return ((data ?? []) as Array<LinhaLog & { resposta?: unknown }>).map(({ resposta, ...l }) => ({
    ...l,
    editavel: ehStatusAtivo(l.status) && l.origem !== "access" && linhasDaResposta(resposta) !== null,
  }));
}
