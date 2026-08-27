// Tickets — módulo Tecnologia e Inovação.
//
// Os dados foram migrados do projeto Supabase original (aijtilkobbychwnqbowr)
// para o banco do próprio Núcleo Contábil em 24/08/2026: 1.178 tickets, 181
// comentários, 276 anexos, 112 atribuições, 46 usuários e 4 admins.
// Não há mais dependência de projeto externo nem de chave extra.
//
// Os ARQUIVOS dos anexos continuam no storage do projeto antigo — as URLs
// gravadas nas descrições e na tabela de anexos apontam para lá. Mover os
// arquivos e reescrever as URLs é uma etapa à parte.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Cliente admin. Só o servidor fala com o banco — a chave nunca vai ao navegador. */
export function ticketsDb(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ---------------------------------------------------------------- domínio

export const SETORES = [
  { id: "contabil", nome: "Contábil" },
  { id: "fiscal", nome: "Fiscal" },
  { id: "trabalhista", nome: "Trabalhista" },
  { id: "financeiro", nome: "Financeiro" },
  { id: "paralegal", nome: "Paralegal" },
  { id: "mei", nome: "MEI" },
  { id: "ti", nome: "TI" },
] as const;

export type SetorId = (typeof SETORES)[number]["id"];

export const STATUS = [
  { id: "backlog", nome: "Backlog" },
  { id: "analise", nome: "Análise" },
  { id: "desenvolvimento", nome: "Desenvolvimento" },
  { id: "operacao_assistida", nome: "Operação assistida" },
  { id: "finalizado", nome: "Finalizado" },
] as const;

export type StatusId = (typeof STATUS)[number]["id"];

export const PRIORIDADES = [
  { id: "baixa", nome: "Baixa" },
  { id: "media", nome: "Média" },
  { id: "alta", nome: "Alta" },
] as const;

export type PrioridadeId = (typeof PRIORIDADES)[number]["id"];

export const SETOR_NOME: Record<string, string> =
  Object.fromEntries(SETORES.map((s) => [s.id, s.nome]));
export const STATUS_NOME: Record<string, string> =
  Object.fromEntries(STATUS.map((s) => [s.id, s.nome]));
export const PRIORIDADE_NOME: Record<string, string> =
  Object.fromEntries(PRIORIDADES.map((p) => [p.id, p.nome]));

export function ehSetor(v: string | undefined | null): v is SetorId {
  return !!v && SETORES.some((s) => s.id === v);
}
export function ehStatus(v: unknown): v is StatusId {
  return typeof v === "string" && STATUS.some((s) => s.id === v);
}
export function ehPrioridade(v: unknown): v is PrioridadeId {
  return typeof v === "string" && PRIORIDADES.some((p) => p.id === v);
}

// ---------------------------------------------------------------- tipos

export interface Responsavel {
  user_email: string;
  user_name: string | null;
}

export interface Anexo {
  id: string;
  url: string;
  filename: string | null;
  uploaded_by_email: string;
  uploaded_at: string;
}

export interface Comentario {
  id: string;
  ticket_id: string;
  author_email: string;
  author_name: string | null;
  body: string;
  created_at: string;
}

/** Esforço e retorno da demanda. Números vêm do Postgres como string. */
export interface Medicao {
  horas_estimadas: number | null;
  horas_realizadas: number | null;
  ganho_horas_mes: number | null;
  valor_hora: number | null;
  /** Calculado no banco: ganho_horas_mes x valor_hora. Nunca digitado. */
  ganho_mensal: number | null;
}

export interface Ticket extends Medicao {
  id: string;
  title: string;
  description: string;
  sector: string;
  status: string;
  priority: string;
  position: number;
  created_by_email: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  responsaveis: Responsavel[];
  qtdComentarios: number;
  qtdAnexos: number;
}

export interface PessoaTickets {
  email: string;
  name: string;
  sector: string;
  is_sub_admin: boolean;
}

/** Converte numeric do Postgres (que chega como string) em número. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const CAMPOS_MEDICAO = "horas_estimadas,horas_realizadas,ganho_horas_mes,valor_hora,ganho_mensal";

function medicao(t: Record<string, unknown>): Medicao {
  return {
    horas_estimadas: num(t.horas_estimadas),
    horas_realizadas: num(t.horas_realizadas),
    ganho_horas_mes: num(t.ganho_horas_mes),
    valor_hora: num(t.valor_hora),
    ganho_mensal: num(t.ganho_mensal),
  };
}

// ---------------------------------------------------------------- leitura

/**
 * Tickets de um setor. `incluirFinalizados=false` traz só o que está em
 * andamento — que é o uso do dia a dia e evita carregar 1.147 finalizados.
 */
export async function listarTickets(
  setor: SetorId,
  incluirFinalizados: boolean
): Promise<Ticket[]> {
  const db = ticketsDb();
  if (!db) return [];

  let q = db
    .from("tickets")
    .select(
      "id,title,description,sector,status,priority,position,created_by_email,created_by_name,created_at,updated_at," +
      CAMPOS_MEDICAO
    )
    .eq("sector", setor)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });

  if (!incluirFinalizados) q = q.neq("status", "finalizado");
  else q = q.limit(400);

  const { data, error } = await q;
  if (error || !data) return [];

  // A lista de colunas é montada por concatenação, então o cliente não
  // consegue inferir o formato da linha; tipamos aqui.
  const linhas = data as unknown as Record<string, unknown>[];
  const ids = linhas.map((t) => t.id as string);
  if (ids.length === 0) return [];

  const [resp, coment, anexos] = await Promise.all([
    db.from("ticket_assignees").select("ticket_id,user_email,user_name").in("ticket_id", ids),
    db.from("ticket_comments").select("ticket_id").in("ticket_id", ids),
    db.from("ticket_attachments").select("ticket_id").in("ticket_id", ids),
  ]);

  const porTicket = new Map<string, Responsavel[]>();
  for (const r of resp.data ?? []) {
    const lista = porTicket.get(r.ticket_id) ?? [];
    lista.push({ user_email: r.user_email, user_name: r.user_name });
    porTicket.set(r.ticket_id, lista);
  }
  const contar = (linhas: { ticket_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const l of linhas ?? []) m.set(l.ticket_id, (m.get(l.ticket_id) ?? 0) + 1);
    return m;
  };
  const nCom = contar(coment.data);
  const nAnex = contar(anexos.data);

  return linhas.map((t) => {
    const id = t.id as string;
    return {
      ...(t as unknown as Ticket),
      ...medicao(t),
      responsaveis: porTicket.get(id) ?? [],
      qtdComentarios: nCom.get(id) ?? 0,
      qtdAnexos: nAnex.get(id) ?? 0,
    };
  });
}

/** Pessoas cadastradas (migradas do sistema antigo) para escolher responsável. */
export async function listarPessoas(): Promise<PessoaTickets[]> {
  const db = ticketsDb();
  if (!db) return [];
  const { data } = await db
    .from("ticket_users")
    .select("email,name,sector,is_sub_admin")
    .order("name");
  return (data ?? []) as PessoaTickets[];
}

/** Pessoa cadastrada no setor de TI (`ticket_users.sector = 'ti'`). */
export async function ehDaTI(email: string | null | undefined): Promise<boolean> {
  const e = email?.toLowerCase();
  if (!e) return false;
  const db = ticketsDb();
  if (!db) return false;
  const { data } = await db
    .from("ticket_users").select("sector").ilike("email", e).eq("sector", "ti").maybeSingle();
  return !!data;
}

/**
 * Admin ou sub-admin. Só eles editam horas, valor/hora e ganho — são números
 * que viram base de decisão, então não podem ficar soltos.
 */
export async function podeEditarMedicao(email: string | null | undefined): Promise<boolean> {
  const e = email?.toLowerCase();
  if (!e) return false;
  const db = ticketsDb();
  if (!db) return false;

  const [adm, usr] = await Promise.all([
    db.from("ticket_admins").select("email").ilike("email", e).maybeSingle(),
    db.from("ticket_users").select("is_sub_admin").ilike("email", e).maybeSingle(),
  ]);
  return !!adm.data || !!usr.data?.is_sub_admin;
}

export async function detalheTicket(id: string) {
  const db = ticketsDb();
  if (!db) return null;

  const [t, c, a, r] = await Promise.all([
    db.from("tickets").select("*").eq("id", id).maybeSingle(),
    db.from("ticket_comments").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
    db.from("ticket_attachments").select("*").eq("ticket_id", id).order("uploaded_at", { ascending: true }),
    db.from("ticket_assignees").select("user_email,user_name").eq("ticket_id", id),
  ]);

  if (!t.data) return null;
  return {
    ticket: { ...t.data, ...medicao(t.data as Record<string, unknown>) },
    comentarios: (c.data ?? []) as Comentario[],
    anexos: (a.data ?? []) as Anexo[],
    responsaveis: (r.data ?? []) as Responsavel[],
  };
}

/** Contagem por status de cada setor, para os contadores das abas. */
export async function resumoPorSetor(): Promise<Record<string, number>> {
  const db = ticketsDb();
  if (!db) return {};
  const { data } = await db.from("tickets").select("sector").neq("status", "finalizado");
  const m: Record<string, number> = {};
  for (const l of data ?? []) m[l.sector] = (m[l.sector] ?? 0) + 1;
  return m;
}

/** Pessoas que já foram responsáveis — alimenta o seletor de atribuição. */
export async function listarResponsaveisConhecidos(): Promise<Responsavel[]> {
  const db = ticketsDb();
  if (!db) return [];
  const { data } = await db.from("ticket_assignees").select("user_email,user_name");
  const m = new Map<string, Responsavel>();
  for (const r of data ?? []) {
    if (!m.has(r.user_email)) m.set(r.user_email, { user_email: r.user_email, user_name: r.user_name });
  }
  return [...m.values()].sort((a, b) =>
    (a.user_name ?? a.user_email).localeCompare(b.user_name ?? b.user_email, "pt-BR")
  );
}

// ---------------------------------------------------------------- auxiliares

export function iniciais(nome: string | null, email: string): string {
  const base = (nome ?? email.split("@")[0]).replace(/[^A-Za-zÀ-ú ]/g, "").trim();
  const p = base.split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function primeiroNome(nome: string | null, email: string): string {
  if (nome) return nome.split(/\s+/)[0];
  return email.split("@")[0];
}

export function formatHoras(v: number | null): string {
  if (v === null) return "—";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h`;
}

export function formatReais(v: number | null): string {
  if (v === null) return "—";
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Desvio entre realizado e estimado, em %. Null se não dá para comparar. */
export function desvioHoras(t: Medicao): number | null {
  if (!t.horas_estimadas || t.horas_realizadas === null) return null;
  return ((t.horas_realizadas - t.horas_estimadas) / t.horas_estimadas) * 100;
}

/** Meses para o esforço se pagar. Null quando não há ganho declarado. */
export function mesesRetorno(t: Medicao): number | null {
  const horas = t.horas_realizadas ?? t.horas_estimadas;
  if (!horas || !t.ganho_horas_mes || t.ganho_horas_mes <= 0) return null;
  return horas / t.ganho_horas_mes;
}

export function tempoRelativo(iso: string): string {
  const d = new Date(iso).getTime();
  const dias = Math.floor((Date.now() - d) / 86400000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `${dias} dias`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = Math.floor(meses / 12);
  return `${anos} ano${anos > 1 ? "s" : ""}`;
}
