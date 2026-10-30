// Reuniões do escritório (Pessoas > Comunicação > Reuniões): agenda preenchida manualmente
// por encarregados / Gestores. Guardado como JSON no bucket privado "cache-nucleo" (sem tabela nova).
import { admin, ehApoioGestaoPessoas } from "./ferias";

export interface Reuniao {
  id: number;
  titulo: string;
  data: string; // AAAA-MM-DD
  hora_inicio: string; // HH:MM
  hora_fim: string | null;
  local: string; // sala, endereço ou "Teams"
  link: string | null; // link da reunião online
  participantes: string | null; // "Todos", setores ou nomes
  pauta: string | null;
  criado_por: string;
  criado_por_nome: string;
  criado_em: string;
}

const BUCKET = "cache-nucleo";
const ARQ = "pessoas-reunioes.json";

export async function lerReunioes(): Promise<Reuniao[]> {
  const sb = admin();
  if (!sb) return [];
  const { data, error } = await sb.storage.from(BUCKET).download(ARQ);
  if (error || !data) return [];
  try { return JSON.parse(await data.text()) as Reuniao[]; } catch { return []; }
}

export async function salvarReunioes(lista: Reuniao[]): Promise<string | null> {
  const sb = admin();
  if (!sb) return "Banco indisponível.";
  const { error } = await sb.storage.from(BUCKET)
    .upload(ARQ, new Blob([JSON.stringify(lista)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
  return error ? error.message : null;
}

export function dataBR(iso: string): string {
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export function diaSemana(iso: string): string {
  return DIAS[new Date(iso.slice(0, 10) + "T12:00:00").getDay()];
}

export function horario(r: Pick<Reuniao, "hora_inicio" | "hora_fim">): string {
  return r.hora_fim ? `${r.hora_inicio} às ${r.hora_fim}` : r.hora_inicio;
}

/** Quem pode marcar reuniões: encarregados, Gestores, apoio de gestão de pessoas e T.I. */
export async function podeAgendar(email: string): Promise<{ ok: boolean; nome: string }> {
  const sb = admin();
  if (!sb) return { ok: false, nome: email };
  const { data: p } = await sb.from("pessoas_perfil").select("nome,setor,encarregado").ilike("email", email).maybeSingle();
  const ok = Boolean(p?.encarregado) || p?.setor === "Gestores" || ehApoioGestaoPessoas(email) || email === "tecnologia@phdcontabil.com.br";
  return { ok, nome: p?.nome ?? email };
}

