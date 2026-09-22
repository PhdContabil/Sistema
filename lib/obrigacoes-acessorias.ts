// Fiscal · Obrigações Acessórias — controle de entregas e prazos por
// cliente (SPED Fiscal, EFD Contribuições, DIRF, DCTF, ECD, ECF...). Ver
// docs/fiscal-trabalhista-migration.sql. Tela: /m/fiscal/obrigacoes-acessorias.
import { createClient } from "@supabase/supabase-js";

export const OBRIGACOES_SUGESTAO = ["SPED Fiscal", "EFD Contribuições", "DIRF", "DCTF", "ECD", "ECF", "Outra"] as const;

export const STATUS_OBRIGACAO = ["Pendente", "Entregue", "Atrasada"] as const;
export type StatusObrigacao = (typeof STATUS_OBRIGACAO)[number];

export interface ObrigacaoAcessoria {
  id: number;
  empresa: string;
  obrigacao: string;
  competencia: string;
  vencimento: string | null;
  status: string;
  responsavel: string | null;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
}

export type NovaObrigacaoAcessoria = Omit<ObrigacaoAcessoria, "id" | "criado_em" | "atualizado_em">;

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function listarObrigacoes(): Promise<{ itens: ObrigacaoAcessoria[]; erro: string | null }> {
  const sb = client();
  if (!sb) return { itens: [], erro: "Banco não configurado." };
  const { data, error } = await sb
    .from("obrigacoes_acessorias")
    .select("*")
    .order("vencimento", { ascending: true, nullsFirst: false })
    .order("empresa");
  if (error) return { itens: [], erro: error.message };
  return { itens: (data ?? []) as ObrigacaoAcessoria[], erro: null };
}

export async function criarObrigacao(input: NovaObrigacaoAcessoria): Promise<string | null> {
  const sb = client();
  if (!sb) return "Banco não configurado.";
  const { error } = await sb.from("obrigacoes_acessorias").insert({
    ...input,
    vencimento: input.vencimento || null,
    responsavel: input.responsavel || null,
    observacao: input.observacao || null,
  });
  return error ? error.message : null;
}

export async function atualizarObrigacao(id: number, input: NovaObrigacaoAcessoria): Promise<string | null> {
  const sb = client();
  if (!sb) return "Banco não configurado.";
  const { error } = await sb
    .from("obrigacoes_acessorias")
    .update({
      ...input,
      vencimento: input.vencimento || null,
      responsavel: input.responsavel || null,
      observacao: input.observacao || null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id);
  return error ? error.message : null;
}

export async function excluirObrigacao(id: number): Promise<string | null> {
  const sb = client();
  if (!sb) return "Banco não configurado.";
  const { error } = await sb.from("obrigacoes_acessorias").delete().eq("id", id);
  return error ? error.message : null;
}
