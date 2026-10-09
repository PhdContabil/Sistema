// Log de Lucros Distribuídos (SERVIDOR) — Supabase, tabela
// lucros_distribuidos_log (docs/lucros-distribuidos-migration.sql).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import type { EntradaLucro } from "./lucros-distribuidos";

function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: (e, i) => fetch(e, { ...i, cache: "no-store" }) },
  });
}

export type OperacaoLucro = "lancamento" | "ajuste" | "exclusao";

export interface LinhaLogLucro {
  id: number;
  criado_em: string;
  operacao: OperacaoLucro;
  codigoempresa: number;
  nome_empresa: string | null;
  codigosocio: number;
  nome_socio: string | null;
  competencia: string;
  data_pagamento: string | null;
  rendimento: number;
  imposto: number;
  status: "lancado" | "erro" | "excluido";
  responsavel: string;
  chave_questor: number | null;
  erro: string | null;
  origem?: "nucleo" | "access";
  teste?: boolean;
}

/**
 * Chave de idempotência do lançamento: mesma empresa, sócio, competência, data
 * e valores = mesma chave. Clicar duas vezes não duplica a distribuição.
 */
export function chaveLancamento(e: EntradaLucro): string {
  const v = [e.rendimento, e.baseIrrf, e.imposto].map((n) => n.toFixed(2)).join("|");
  const h = createHash("sha1")
    .update(`lucro|${e.codigoempresa}|${e.codigosocio}|${e.competencia}|${e.dataPagamento}|${e.tisencao}|${v}`)
    .digest("hex").slice(0, 20);
  return `lucro:${e.codigoempresa}:${e.codigosocio}:${e.competencia}:${h}`;
}

/** Ajuste: a chave inclui o lançamento alterado e os valores novos. */
export function chaveAjuste(e: EntradaLucro, chave: number): string {
  return `${chaveLancamento(e)}:ajuste:${chave}`;
}

export function chaveExclusao(codigoempresa: number, chave: number): string {
  return `lucro:${codigoempresa}:excluir:${chave}`;
}

export async function jaLancado(chave: string): Promise<LinhaLogLucro | null> {
  const sb = db();
  if (!sb) return null;
  const { data } = await sb
    .from("lucros_distribuidos_log").select("*")
    .eq("idempotency_key", chave).eq("operacao", "lancamento").eq("status", "lancado")
    .limit(1).maybeSingle();
  return (data as LinhaLogLucro | null) ?? null;
}

export async function registrarLog(l: {
  operacao: OperacaoLucro;
  entrada: Pick<EntradaLucro, "codigoempresa" | "codigosocio" | "competencia" | "dataPagamento" | "rendimento" | "imposto">;
  nomeEmpresa: string | null; nomeSocio: string | null;
  status: "lancado" | "erro"; responsavel: string; chave: string;
  chaveQuestor?: number | null; resposta?: unknown; erro?: string | null;
}): Promise<void> {
  const sb = db();
  if (!sb) return;
  const { error } = await sb.from("lucros_distribuidos_log").insert({
    operacao: l.operacao,
    codigoempresa: l.entrada.codigoempresa,
    nome_empresa: l.nomeEmpresa,
    codigosocio: l.entrada.codigosocio,
    nome_socio: l.nomeSocio,
    competencia: l.entrada.competencia,
    data_pagamento: l.entrada.dataPagamento,
    rendimento: l.entrada.rendimento,
    imposto: l.entrada.imposto,
    status: l.status,
    responsavel: l.responsavel,
    idempotency_key: l.chave,
    chave_questor: l.chaveQuestor ?? null,
    resposta: l.resposta ?? null,
    erro: l.erro ?? null,
  });
  // O log não pode derrubar uma operação que já foi gravada no Questor.
  if (error) console.error("[lucros-distribuidos/log]", error.message);
}

/** Depois de excluir no Questor, o lançamento original deixa de contar como "lancado". */
export async function marcarExcluido(codigoempresa: number, chaveQuestor: number): Promise<void> {
  const sb = db();
  if (!sb) return;
  const { error } = await sb.from("lucros_distribuidos_log")
    .update({ status: "excluido" })
    .eq("codigoempresa", codigoempresa).eq("chave_questor", chaveQuestor)
    .eq("operacao", "lancamento").eq("status", "lancado");
  if (error) console.error("[lucros-distribuidos/log]", error.message);
}

export async function listarLog(limite = 2000): Promise<LinhaLogLucro[]> {
  const sb = db();
  if (!sb) return [];
  const { data, error } = await sb
    .from("lucros_distribuidos_log").select("*")
    .order("criado_em", { ascending: false }).limit(limite);
  if (error) throw new Error(`Falha ao ler o log: ${error.message}`);
  return (data ?? []) as LinhaLogLucro[];
}
