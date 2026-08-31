// Análise de Dissídio — acesso a dados (SERVIDOR).
//
// Duas fontes distintas, de propósito:
//  - PERFIL da empresa (faturamento, empregados, horas, mensalidade vigente)
//    vem da API Questor em tempo real. Não copiamos nada para cá.
//  - DECISÃO do reajuste (percentual, valor novo, observações, autoria) é
//    nossa e mora no Supabase, por ano.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Ajuste, Rodada } from "./dissidio-tipos";

export * from "./dissidio-tipos";
export * from "./dissidio-calculo";

function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Garante que a rodada do ano existe e devolve o estado atual. */
export async function obterRodada(ano: number, email?: string | null): Promise<Rodada | null> {
  const sb = db();
  if (!sb) return null;

  const { data } = await sb.from("dissidio_rodadas").select("*").eq("ano", ano).maybeSingle();
  if (data) return data as Rodada;

  const { data: nova } = await sb
    .from("dissidio_rodadas")
    .insert({ ano, criada_por: email ?? null, atualizada_por: email ?? null })
    .select("*")
    .maybeSingle();
  return (nova as Rodada) ?? null;
}

export async function listarAjustes(ano: number): Promise<Map<number, Ajuste>> {
  const sb = db();
  if (!sb) return new Map();
  const { data } = await sb.from("dissidio_ajustes").select("*").eq("ano", ano);
  const m = new Map<number, Ajuste>();
  for (const a of (data ?? []) as Ajuste[]) m.set(a.codigoempresa, a);
  return m;
}

export async function salvarRodada(
  ano: number,
  campos: { percentual_geral?: number; observacao?: string | null; fechada?: boolean },
  email: string
) {
  const sb = db();
  if (!sb) return { error: "Banco indisponível." };
  const { error } = await sb
    .from("dissidio_rodadas")
    .update({ ...campos, atualizada_em: new Date().toISOString(), atualizada_por: email })
    .eq("ano", ano);
  return { error: error?.message ?? null };
}

export async function salvarAjuste(
  ano: number,
  codigoempresa: number,
  campos: Partial<Pick<Ajuste, "percentual" | "valor_novo" | "valor_base" | "origem" | "observacao">>,
  email: string
) {
  const sb = db();
  if (!sb) return { error: "Banco indisponível." };
  const { error } = await sb.from("dissidio_ajustes").upsert(
    {
      ano,
      codigoempresa,
      ...campos,
      analisado_por: email,
      analisado_em: new Date().toISOString(),
    },
    { onConflict: "ano,codigoempresa" }
  );
  return { error: error?.message ?? null };
}

/** Remove o ajuste individual — a empresa volta a seguir o percentual geral. */
export async function removerAjuste(ano: number, codigoempresa: number) {
  const sb = db();
  if (!sb) return { error: "Banco indisponível." };
  const { error } = await sb
    .from("dissidio_ajustes").delete()
    .eq("ano", ano).eq("codigoempresa", codigoempresa);
  return { error: error?.message ?? null };
}
