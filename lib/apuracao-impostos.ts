// Fiscal · Apuração de Impostos — ICMS, PIS, COFINS, IPI por empresa e
// competência. Ver docs/fiscal-trabalhista-migration.sql pra criação da
// tabela. Tela: /m/fiscal/apuracao-impostos.
import { createClient } from "@supabase/supabase-js";

export const IMPOSTOS = ["ICMS", "PIS", "COFINS", "IPI", "Outro"] as const;
export type Imposto = (typeof IMPOSTOS)[number];

export const STATUS_APURACAO = ["Pendente", "Pago", "Atrasado"] as const;
export type StatusApuracao = (typeof STATUS_APURACAO)[number];

export interface ApuracaoImposto {
  id: number;
  empresa: string;
  imposto: string;
  competencia: string;
  valor_apurado: number | null;
  vencimento: string | null;
  status: string;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
}

export type NovaApuracaoImposto = Omit<ApuracaoImposto, "id" | "criado_em" | "atualizado_em">;

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function listarApuracoes(): Promise<{ itens: ApuracaoImposto[]; erro: string | null }> {
  const sb = client();
  if (!sb) return { itens: [], erro: "Banco não configurado." };
  const { data, error } = await sb
    .from("apuracao_impostos")
    .select("*")
    .order("competencia", { ascending: false })
    .order("empresa");
  if (error) return { itens: [], erro: error.message };
  return { itens: (data ?? []) as ApuracaoImposto[], erro: null };
}

export async function criarApuracao(input: NovaApuracaoImposto): Promise<string | null> {
  const sb = client();
  if (!sb) return "Banco não configurado.";
  const { error } = await sb.from("apuracao_impostos").insert({
    ...input,
    vencimento: input.vencimento || null,
    observacao: input.observacao || null,
  });
  return error ? error.message : null;
}

export async function atualizarApuracao(id: number, input: NovaApuracaoImposto): Promise<string | null> {
  const sb = client();
  if (!sb) return "Banco não configurado.";
  const { error } = await sb
    .from("apuracao_impostos")
    .update({ ...input, vencimento: input.vencimento || null, observacao: input.observacao || null, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  return error ? error.message : null;
}

export async function excluirApuracao(id: number): Promise<string | null> {
  const sb = client();
  if (!sb) return "Banco não configurado.";
  const { error } = await sb.from("apuracao_impostos").delete().eq("id", id);
  return error ? error.message : null;
}
