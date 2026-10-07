// Log do Informe de Rendimentos (SERVIDOR) — Supabase, tabela
// informe_rendimentos_log (docs/informe-rendimentos-migration.sql).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import type { EntradaInforme, PlanoInforme } from "./informe-rendimentos";

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
  regime: string;
  rendimento: number;
  demais_receitas: number;
  dividendos: number;
  retencao: number;
  pis: number;
  cofins: number;
  status: "lancado" | "erro";
  responsavel: string;
  erro: string | null;
}

/**
 * Chave de idempotência: mesma empresa, competência, regime e valores = mesma
 * chave. Clicar duas vezes (ou recarregar e reenviar) não duplica o lançamento
 * — coisa que o DMax do Access não impedia.
 */
export function chaveIdempotencia(e: EntradaInforme, regime: string): string {
  const v = [e.rendimento, e.demaisReceitas, e.dividendos, e.retencao].map((n) => n.toFixed(2)).join("|");
  const h = createHash("sha1").update(`${e.codigoempresa}|${e.competencia}|${regime}|${v}`).digest("hex").slice(0, 20);
  return `informe:${e.codigoempresa}:${e.competencia}:${h}`;
}

/** Já existe lançamento bem-sucedido com esta chave? (Barra o reenvio antes de chamar a API.) */
export async function jaLancado(chave: string): Promise<LinhaLog | null> {
  const sb = db();
  if (!sb) return null;
  const { data } = await sb
    .from("informe_rendimentos_log").select("*")
    .eq("idempotency_key", chave).eq("status", "lancado").limit(1).maybeSingle();
  return (data as LinhaLog | null) ?? null;
}

export async function registrarLog(l: {
  entrada: EntradaInforme; plano: PlanoInforme; nomeEmpresa: string | null;
  status: "lancado" | "erro"; responsavel: string; chave: string;
  resposta?: unknown; erro?: string | null;
}): Promise<void> {
  const sb = db();
  if (!sb) return;
  const { error } = await sb.from("informe_rendimentos_log").insert({
    codigoempresa: l.entrada.codigoempresa,
    nome_empresa: l.nomeEmpresa,
    competencia: l.entrada.competencia,
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

export async function listarLog(limite = 100): Promise<LinhaLog[]> {
  const sb = db();
  if (!sb) return [];
  const { data, error } = await sb
    .from("informe_rendimentos_log").select("*")
    .order("criado_em", { ascending: false }).limit(limite);
  if (error) throw new Error(`Falha ao ler o log: ${error.message}`);
  return (data ?? []) as LinhaLog[];
}
