// Trabalhista · Folha de Pagamento — cálculo de salários por funcionário e
// competência. Ver docs/fiscal-trabalhista-migration.sql. Tela:
// /m/trabalhista/folha-pagamento.
import { createClient } from "@supabase/supabase-js";

export const STATUS_FOLHA = ["Aberta", "Fechada", "Paga"] as const;
export type StatusFolha = (typeof STATUS_FOLHA)[number];

export interface FolhaPagamentoItem {
  id: number;
  funcionario: string;
  empresa: string;
  competencia: string;
  salario_bruto: number;
  descontos: number;
  salario_liquido: number;
  status: string;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
}

export type NovaFolhaPagamento = Omit<FolhaPagamentoItem, "id" | "criado_em" | "atualizado_em">;

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function listarFolha(): Promise<{ itens: FolhaPagamentoItem[]; erro: string | null }> {
  const sb = client();
  if (!sb) return { itens: [], erro: "Banco não configurado." };
  const { data, error } = await sb
    .from("folha_pagamento")
    .select("*")
    .order("competencia", { ascending: false })
    .order("funcionario");
  if (error) return { itens: [], erro: error.message };
  return { itens: (data ?? []) as FolhaPagamentoItem[], erro: null };
}

export async function criarFolha(input: NovaFolhaPagamento): Promise<string | null> {
  const sb = client();
  if (!sb) return "Banco não configurado.";
  const { error } = await sb.from("folha_pagamento").insert({
    ...input,
    observacao: input.observacao || null,
  });
  return error ? error.message : null;
}

export async function atualizarFolha(id: number, input: NovaFolhaPagamento): Promise<string | null> {
  const sb = client();
  if (!sb) return "Banco não configurado.";
  const { error } = await sb
    .from("folha_pagamento")
    .update({ ...input, observacao: input.observacao || null, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  return error ? error.message : null;
}

export async function excluirFolha(id: number): Promise<string | null> {
  const sb = client();
  if (!sb) return "Banco não configurado.";
  const { error } = await sb.from("folha_pagamento").delete().eq("id", id);
  return error ? error.message : null;
}
