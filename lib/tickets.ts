// Tickets — módulo Tecnologia e Inovação.
//
// Os dados continuam no projeto Supabase original do sistema de tickets
// (aijtilkobbychwnqbowr). O Núcleo Contábil passa a ser a interface, sem
// copiar nada: fonte única, e o sistema antigo segue funcionando durante a
// transição. Só o servidor fala com esse banco — a chave nunca vai ao
// navegador.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const TICKETS_URL =
  process.env.TICKETS_SUPABASE_URL || "https://aijtilkobbychwnqbowr.supabase.co";

/** Cliente admin do banco de tickets. Null se a chave não estiver configurada. */
export function ticketsDb(): SupabaseClient | null {
  const key = process.env.TICKETS_SUPABASE_SERVICE_KEY;
  if (!TICKETS_URL || !key) return null;
  return createClient(TICKETS_URL, key, { auth: { persistSession: false } });
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

export interface Ticket {
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
  responsaveis: Responsavel[];
  qtdComentarios: number;
  qtdAnexos: number;
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
    .select("id,title,description,sector,status,priority,position,created_by_email,created_by_name,created_at,updated_at")
    .eq("sector", setor)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });

  if (!incluirFinalizados) q = q.neq("status", "finalizado");
  else q = q.limit(400);

  const { data, error } = await q;
  if (error || !data) return [];

  const ids = data.map((t) => t.id);
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

  return data.map((t) => ({
    ...t,
    responsaveis: porTicket.get(t.id) ?? [],
    qtdComentarios: nCom.get(t.id) ?? 0,
    qtdAnexos: nAnex.get(t.id) ?? 0,
  }));
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
    ticket: t.data,
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
