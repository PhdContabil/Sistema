// Peças de servidor comuns aos módulos do Integra Contador (Situação Fiscal,
// Procurações, DCTFWeb…): cliente Supabase com service_role e o cofre de
// credenciais SERPRO (tabela credenciais_serpro, linha única id=1).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CredenciaisSerpro } from "./integra-contador";

export function db(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Banco não configurado (SUPABASE_SERVICE_ROLE_KEY).");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (e, i) => fetch(e, { ...i, cache: "no-store" }) },
  });
}

export const soDigitos = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");

export async function carregarCredenciais(): Promise<CredenciaisSerpro> {
  const { data, error } = await db().from("credenciais_serpro")
    .select("consumer_key, consumer_secret, pfx_base64, pfx_senha, contratante_cnpj").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.consumer_key || !data.pfx_base64 || !data.contratante_cnpj) {
    throw new Error("Credenciais SERPRO não configuradas (certificado A1, consumer key/secret e CNPJ do escritório).");
  }
  return data as CredenciaisSerpro;
}

/** Rastro de chamada paga ao SERPRO (quem, quando, resultado). Melhor-esforço. */
export async function registrarChamada(canal: string, assunto: string, cnpj: string, sucesso: boolean, detalhe: Record<string, unknown>) {
  await db().from("notificacoes_log").insert({ destino: cnpj, canal, assunto, sucesso, detalhe })
    .then(() => undefined, () => undefined);
}
