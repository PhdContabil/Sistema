// Tipos e utilidades do fluxo de férias.
import { createClient } from "@supabase/supabase-js";

export type StatusFerias = "pendente" | "aprovada" | "rejeitada" | "cancelada";

export interface PeriodoFerias { id?: number; inicio: string; fim: string; dias?: number }

export interface SolicitacaoFerias {
  id: number;
  pessoa_id: number;
  solicitante: string;
  setor: string;
  observacao: string | null;
  status: StatusFerias;
  aprovador: string | null;
  avaliado_em: string | null;
  motivo_recusa: string | null;
  criado_em: string;
  periodos?: PeriodoFerias[];
  pessoa_nome?: string;
}

export function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svc) return null;
  return createClient(url, svc, { auth: { persistSession: false } });
}

/** Encarregado responsável por um setor (fallback: gestão de pessoas). */
/**
 * Quem enxerga as solicitações de TODOS os setores em "Aprovar férias".
 *
 * Normalmente é quem está no setor "Gestores". Fora disso, esta lista abre a
 * mesma visão para quem apoia a gestão de pessoas sem ser gestor de setor —
 * hoje a Julia Rodrigues, que é do Contábil (pedido do Gabriel, 24/09/2026).
 *
 * Preferi a lista a mudar o setor dela no cadastro: o setor alimenta agenda,
 * férias e organograma, e trocá-lo por causa de uma permissão espalharia o
 * efeito por telas que não têm nada a ver com isso.
 */
export const APOIO_GESTAO_PESSOAS = ["julia.rodrigues@phdcontabil.com.br"];

export function ehApoioGestaoPessoas(email: string | null | undefined): boolean {
  const e = email?.toLowerCase();
  return !!e && APOIO_GESTAO_PESSOAS.includes(e);
}

/** Visão completa: todos os setores, e não só o próprio. */
export function temVisaoDeGestores(
  email: string | null | undefined,
  setor: string | null | undefined
): boolean {
  return setor === "Gestores" || ehApoioGestaoPessoas(email);
}

export async function encarregadoDoSetor(setor: string): Promise<{ nome: string; email: string } | null> {
  const sb = admin();
  if (!sb) return null;

  const { data } = await sb
    .from("pessoas_perfil")
    .select("nome,email")
    .eq("setor", setor)
    .eq("encarregado", true)
    .not("email", "is", null)
    .limit(1);
  if (data && data[0]) return data[0] as { nome: string; email: string };

  // fallback: gestor de pessoas
  const { data: g } = await sb
    .from("pessoas_perfil")
    .select("nome,email")
    .eq("slug", "manoel-junior")
    .maybeSingle();
  return (g as { nome: string; email: string } | null) ?? null;
}

export function formatarPeriodos(ps: PeriodoFerias[]): string {
  return ps
    .map((p) => `${dataBR(p.inicio)} a ${dataBR(p.fim)} (${diasEntre(p.inicio, p.fim)} dias)`)
    .join(" · ");
}

export function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function diasEntre(inicio: string, fim: string): number {
  const a = new Date(inicio + "T00:00:00");
  const b = new Date(fim + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

export const ROTULO_STATUS: Record<StatusFerias, string> = {
  pendente: "Aguardando aprovação",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  cancelada: "Cancelada",
};

export const CLASSE_STATUS: Record<StatusFerias, string> = {
  pendente: "sit-observar",
  aprovada: "sit-ok",
  rejeitada: "sit-critico",
  cancelada: "badge-soft",
};
