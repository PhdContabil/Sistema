// Inventário de T.I. — equipamentos (notebooks/desktops em uso, notebooks em
// estoque no CPD) e periféricos, todos numa tabela só (inventario_ti),
// diferenciados pela coluna `categoria`. Ver docs/inventario-ti-migration.sql
// pra criação da tabela e carga inicial (vinda de Controle de Notebook.xlsx).
//
// Server-side. Tela: /m/tecnologia/inventario — só T.I./Diretoria (mesma
// regra do restante de Tecnologia, ver podeAcessarAppTecnologia em lib/acesso.ts).
import { createClient } from "@supabase/supabase-js";

export type CategoriaInventario = "notebook_uso" | "notebook_estoque" | "periferico";

export const CATEGORIA_LABEL: Record<CategoriaInventario, string> = {
  notebook_uso: "Em uso",
  notebook_estoque: "Em estoque (CPD)",
  periferico: "Periférico",
};

export interface ItemInventario {
  id: number;
  categoria: CategoriaInventario;
  item: string;
  responsavel: string | null;
  setor: string | null;
  marca: string | null;
  especificacao: string | null;
  ano: number | null;
  categoria_periferico: string | null;
  status: string;
  quantidade: number;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
}

export type NovoItemInventario = Omit<ItemInventario, "id" | "criado_em" | "atualizado_em">;

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Lista tudo, ordenado por item. Devolve o erro do Supabase em vez de
 * engolir — se a tabela ainda não existe (migração em
 * docs/inventario-ti-migration.sql não rodada), a tela precisa mostrar isso
 * em vez de só aparecer "0" em tudo sem explicação.
 */
export async function listarInventario(): Promise<{ itens: ItemInventario[]; erro: string | null }> {
  const sb = client();
  if (!sb) return { itens: [], erro: "Banco não configurado." };
  const { data, error } = await sb.from("inventario_ti").select("*").order("item");
  if (error) return { itens: [], erro: error.message };
  return { itens: (data ?? []) as ItemInventario[], erro: null };
}

export async function criarItemInventario(input: NovoItemInventario): Promise<string | null> {
  const sb = client();
  if (!sb) return "Banco não configurado.";
  const { error } = await sb.from("inventario_ti").insert({
    ...input,
    responsavel: input.responsavel || null,
    setor: input.setor || null,
    marca: input.marca || null,
    especificacao: input.especificacao || null,
    categoria_periferico: input.categoria_periferico || null,
    observacao: input.observacao || null,
  });
  return error ? error.message : null;
}

export async function atualizarItemInventario(id: number, input: NovoItemInventario): Promise<string | null> {
  const sb = client();
  if (!sb) return "Banco não configurado.";
  const { error } = await sb
    .from("inventario_ti")
    .update({
      ...input,
      responsavel: input.responsavel || null,
      setor: input.setor || null,
      marca: input.marca || null,
      especificacao: input.especificacao || null,
      categoria_periferico: input.categoria_periferico || null,
      observacao: input.observacao || null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id);
  return error ? error.message : null;
}

export async function excluirItemInventario(id: number): Promise<string | null> {
  const sb = client();
  if (!sb) return "Banco não configurado.";
  const { error } = await sb.from("inventario_ti").delete().eq("id", id);
  return error ? error.message : null;
}
