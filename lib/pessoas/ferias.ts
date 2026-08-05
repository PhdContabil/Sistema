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
