// Trabalhista · eSocial — eventos enviados ao governo (admissão,
// desligamento, férias, afastamento...). Ver
// docs/fiscal-trabalhista-migration.sql. Tela: /m/trabalhista/esocial.
import { createClient } from "@supabase/supabase-js";

export const TIPOS_EVENTO_ESOCIAL = ["Admissão", "Desligamento", "Férias", "Afastamento", "Alteração Contratual", "Outro"] as const;

export const STATUS_ESOCIAL = ["Pendente", "Enviado", "Processado", "Erro"] as const;
export type StatusEsocial = (typeof STATUS_ESOCIAL)[number];

export interface EsocialEvento {
  id: number;
  empresa: string;
  tipo_evento: string;
  competencia: string;
  data_envio: string | null;
  protocolo: string | null;
  status: string;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
}

export type NovoEsocialEvento = Omit<EsocialEvento, "id" | "criado_em" | "atualizado_em">;

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function listarEventosEsocial(): Promise<{ itens: EsocialEvento[]; erro: string | null }> {
  const sb = client();
  if (!sb) return { itens: [], erro: "Banco não configurado." };
  const { data, error } = await sb
    .from("esocial_eventos")
    .select("*")
    .order("competencia", { ascending: false })
    .order("empresa");
  if (error) return { itens: [], erro: error.message };
  return { itens: (data ?? []) as EsocialEvento[], erro: null };
}

export async function criarEventoEsocial(input: NovoEsocialEvento): Promise<string | null> {
  const sb = client();
  if (!sb) return "Banco não configurado.";
  const { error } = await sb.from("esocial_eventos").insert({
    ...input,
    data_envio: input.data_envio || null,
    protocolo: input.protocolo || null,
    observacao: input.observacao || null,
  });
  return error ? error.message : null;
}

export async function atualizarEventoEsocial(id: number, input: NovoEsocialEvento): Promise<string | null> {
  const sb = client();
  if (!sb) return "Banco não configurado.";
  const { error } = await sb
    .from("esocial_eventos")
    .update({
      ...input,
      data_envio: input.data_envio || null,
      protocolo: input.protocolo || null,
      observacao: input.observacao || null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id);
  return error ? error.message : null;
}

export async function excluirEventoEsocial(id: number): Promise<string | null> {
  const sb = client();
  if (!sb) return "Banco não configurado.";
  const { error } = await sb.from("esocial_eventos").delete().eq("id", id);
  return error ? error.message : null;
}
