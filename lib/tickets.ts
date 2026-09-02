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

/**
 * Cliente do projeto Supabase do sistema antigo de tickets — continua no ar e
 * recebendo tickets novos, então de tempos em tempos alguém (admin) aciona a
 * sincronização manual pra trazer o que ainda não veio pro Núcleo.
 */
function origemDb(): SupabaseClient | null {
  const url = process.env.TICKETS_ORIGEM_SUPABASE_URL;
  const key = process.env.TICKETS_ORIGEM_SERVICE_ROLE_KEY;
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

/**
 * Admin "de verdade" (linha em ticket_admins) — diferente de podeEditarMedicao,
 * que também inclui sub-admins. Usado para o que só o admin pleno pode ver:
 * todos os setores na barra lateral e o filtro de prioridade.
 */
export async function ehAdminGeral(email: string | null | undefined): Promise<boolean> {
  const e = email?.toLowerCase();
  if (!e) return false;
  const db = ticketsDb();
  if (!db) return false;
  const { data } = await db.from("ticket_admins").select("email").ilike("email", e).maybeSingle();
  return !!data;
}

/** Setor cadastrado da pessoa em ticket_users — define o que ela enxerga quando não é admin. */
export async function obterSetorUsuario(email: string | null | undefined): Promise<SetorId | null> {
  const e = email?.toLowerCase();
  if (!e) return null;
  const db = ticketsDb();
  if (!db) return null;
  const { data } = await db.from("ticket_users").select("sector").ilike("email", e).maybeSingle();
  const setor = (data as { sector?: string } | null)?.sector;
  return ehSetor(setor) ? setor : null;
}

/**
 * Verdadeiro se a pessoa pertence ao setor de TI (ticket_users.sector = "ti")
 * ou é admin de Tickets. Usado pelo Catálogo de Sistemas (Tecnologia) para
 * mostrar as ferramentas internas só a quem é da área.
 */
export async function ehDaTI(email: string | null | undefined): Promise<boolean> {
  const e = email?.toLowerCase();
  if (!e) return false;
  const db = ticketsDb();
  if (!db) return false;

  const [usr, adm] = await Promise.all([
    db.from("ticket_users").select("sector").ilike("email", e).maybeSingle(),
    db.from("ticket_admins").select("email").ilike("email", e).maybeSingle(),
  ]);
  return usr.data?.sector === "ti" || !!adm.data;
}

/**
 * Só essas pessoas acessam as telas de administração de Tickets (Dashboard,
 * Usuários, Gerenciar admins) — mais restrito que podeEditarMedicao, que
 * também libera sub-admins de setor (ex.: o contato do Contábil), que não
 * devem enxergar essas telas. Lista fixa, pedida pelo Pedro em 01/09/2026
 * depois de a Maisa (sub-admin do Contábil) aparecer com esse acesso.
 */
const ADMIN_NAV_EMAILS = [
  "tecnologia@phdcontabil.com.br",
  "gabriel.santos@phdcontabil.com.br",
  "eduardo@phdcontabil.com.br",
  "julia@phdcontabil.com.br",
];
export function ehAdminNav(email: string | null | undefined): boolean {
  const e = email?.toLowerCase();
  return !!e && ADMIN_NAV_EMAILS.includes(e);
}

/**
 * Quem vê horas/ganho no detalhe do ticket — T.I. de verdade (ehDaTI) mais
 * Junior e EdCarlos (Diretoria), mesmo que não sejam do setor de TI. Pedido
 * do Pedro em 01/09/2026: sub-admins de setor (ex.: Maisa) não devem ver.
 */
const MEDICAO_EXTRA_EMAILS = ["junior@phdcontabil.com.br", "edcarlos@phdcontabil.com.br"];
export async function podeVerMedicao(email: string | null | undefined): Promise<boolean> {
  const e = email?.toLowerCase();
  if (!e) return false;
  if (MEDICAO_EXTRA_EMAILS.includes(e)) return true;
  return ehDaTI(e);
}

// ---------------------------------------------------------------- admins

/** Lista de e-mails com acesso de administrador aos Tickets. */
export async function listarAdmins(): Promise<string[]> {
  const db = ticketsDb();
  if (!db) return [];
  const { data } = await db.from("ticket_admins").select("email").order("email");
  return (data ?? []).map((r) => (r as { email: string }).email);
}

export async function adicionarAdmin(email: string): Promise<string | null> {
  const db = ticketsDb();
  if (!db) return "Banco não configurado.";
  const e = email.trim().toLowerCase();
  if (!e || !e.includes("@")) return "E-mail inválido.";
  const { error } = await db.from("ticket_admins").insert({ email: e });
  if (error) return error.message;
  return null;
}

export async function removerAdmin(email: string): Promise<string | null> {
  const db = ticketsDb();
  if (!db) return "Banco não configurado.";
  const { error } = await db.from("ticket_admins").delete().ilike("email", email.trim());
  if (error) return error.message;
  return null;
}

// ---------------------------------------------------------------- usuários (ticket_users)

export async function salvarUsuario(dados: {
  email: string; name: string; sector: string; is_sub_admin: boolean;
}): Promise<string | null> {
  const db = ticketsDb();
  if (!db) return "Banco não configurado.";
  const email = dados.email.trim().toLowerCase();
  const name = dados.name.trim();
  if (!email || !email.includes("@")) return "E-mail inválido.";
  if (!name) return "Informe o nome.";
  if (!ehSetor(dados.sector)) return "Setor inválido.";
  const { error } = await db
    .from("ticket_users")
    .upsert(
      { email, name, sector: dados.sector, is_sub_admin: !!dados.is_sub_admin },
      { onConflict: "email" }
    );
  if (error) return error.message;
  return null;
}

export async function removerUsuario(email: string): Promise<string | null> {
  const db = ticketsDb();
  if (!db) return "Banco não configurado.";
  const { error } = await db.from("ticket_users").delete().ilike("email", email.trim());
  if (error) return error.message;
  return null;
}

// ---------------------------------------------------------------- permissões por módulo/app (T.I./Diretoria)

/** "liberado"/"bloqueado" — não existe linha para "herdado" (é o padrão do setor). */
export type NivelPermissao = "liberado" | "bloqueado";

export interface OverridePermissao {
  modulo_id: string;
  /** null = override do módulo inteiro; preenchido = override de um app/submódulo específico. */
  app_nome: string | null;
  nivel: NivelPermissao;
}

/** Todos os overrides de uma pessoa, já no formato usado pela tela (módulos + apps). */
export async function listarPermissoesPessoa(email: string): Promise<{
  modulos: Record<string, NivelPermissao>;
  apps: Record<string, Record<string, NivelPermissao>>;
}> {
  const vazio = { modulos: {}, apps: {} };
  const db = ticketsDb();
  if (!db) return vazio;
  const { data, error } = await db
    .from("ticket_user_permissoes")
    .select("modulo_id,app_nome,nivel")
    .ilike("email", email.trim());
  if (error || !data) return vazio;

  const modulos: Record<string, NivelPermissao> = {};
  const apps: Record<string, Record<string, NivelPermissao>> = {};
  for (const row of data as { modulo_id: string; app_nome: string | null; nivel: NivelPermissao }[]) {
    if (row.app_nome) {
      apps[row.modulo_id] = { ...(apps[row.modulo_id] ?? {}), [row.app_nome]: row.nivel };
    } else {
      modulos[row.modulo_id] = row.nivel;
    }
  }
  return { modulos, apps };
}

/** Substitui, de uma vez, todos os overrides da pessoa pelo conjunto atual da tela. */
export async function salvarPermissoesPessoa(
  email: string,
  overrides: { modulos: Record<string, NivelPermissao>; apps: Record<string, Record<string, NivelPermissao>> }
): Promise<string | null> {
  const db = ticketsDb();
  if (!db) return "Banco não configurado.";
  const e = email.trim().toLowerCase();
  if (!e || !e.includes("@")) return "E-mail inválido.";

  // "herdado" nunca vira linha no banco (é o padrão, ausência de override) —
  // só liberado/bloqueado são persistidos; qualquer outro valor é ignorado.
  const ehValido = (n: string): n is NivelPermissao => n === "liberado" || n === "bloqueado";

  const linhas: { email: string; modulo_id: string; app_nome: string | null; nivel: NivelPermissao }[] = [];
  for (const [moduloId, nivel] of Object.entries(overrides.modulos)) {
    if (ehValido(nivel)) linhas.push({ email: e, modulo_id: moduloId, app_nome: null, nivel });
  }
  for (const [moduloId, apps] of Object.entries(overrides.apps)) {
    for (const [appNome, nivel] of Object.entries(apps)) {
      if (ehValido(nivel)) linhas.push({ email: e, modulo_id: moduloId, app_nome: appNome, nivel });
    }
  }

  const { error: erroDelete } = await db.from("ticket_user_permissoes").delete().ilike("email", e);
  if (erroDelete) return erroDelete.message;

  if (linhas.length > 0) {
    const { error: erroInsert } = await db.from("ticket_user_permissoes").insert(linhas);
    if (erroInsert) return erroInsert.message;
  }
  return null;
}

// ---------------------------------------------------------------- dashboard (log + filtros)

export interface FiltroDashboard {
  busca?: string;
  setor?: string;
  status?: string;
  responsavel?: string;
  criadoDe?: string;
  criadoAte?: string;
  finalizadoDe?: string;
  finalizadoAte?: string;
}

/** Log de tickets para o dashboard administrativo — sem gráficos, só a lista filtrada. */
export async function listarTicketsDashboard(f: FiltroDashboard): Promise<Ticket[]> {
  const db = ticketsDb();
  if (!db) return [];

  let q = db
    .from("tickets")
    .select(
      "id,title,description,sector,status,priority,position,created_by_email,created_by_name,created_at,updated_at,closed_at," +
      CAMPOS_MEDICAO
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (f.setor && ehSetor(f.setor)) q = q.eq("sector", f.setor);
  if (f.status && ehStatus(f.status)) q = q.eq("status", f.status);
  if (f.busca) {
    const termo = f.busca.trim().replace(/[%,]/g, "");
    if (termo) q = q.or(`title.ilike.%${termo}%,description.ilike.%${termo}%`);
  }
  if (f.criadoDe) q = q.gte("created_at", f.criadoDe);
  if (f.criadoAte) q = q.lte("created_at", f.criadoAte);
  if (f.finalizadoDe) q = q.gte("closed_at", f.finalizadoDe);
  if (f.finalizadoAte) q = q.lte("closed_at", f.finalizadoAte);

  const { data, error } = await q;
  if (error || !data) return [];
  const linhas = data as unknown as Record<string, unknown>[];
  const ids = linhas.map((t) => t.id as string);

  const resp = ids.length
    ? await db.from("ticket_assignees").select("ticket_id,user_email,user_name").in("ticket_id", ids)
    : { data: [] as { ticket_id: string; user_email: string; user_name: string | null }[] };

  const porTicket = new Map<string, Responsavel[]>();
  for (const r of resp.data ?? []) {
    const lista = porTicket.get(r.ticket_id) ?? [];
    lista.push({ user_email: r.user_email, user_name: r.user_name });
    porTicket.set(r.ticket_id, lista);
  }

  let tickets = linhas.map((t) => {
    const id = t.id as string;
    return {
      ...(t as unknown as Ticket),
      ...medicao(t),
      responsaveis: porTicket.get(id) ?? [],
      qtdComentarios: 0,
      qtdAnexos: 0,
    };
  });

  if (f.responsavel) {
    const alvo = f.responsavel.toLowerCase();
    tickets = tickets.filter((t) => t.responsaveis.some((r) => r.user_email.toLowerCase() === alvo));
  }

  return tickets;
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

// ---------------------------------------------------------------- sincronização com o sistema antigo

export interface ResultadoSincronizacao {
  novosTickets: number;
  comentarios: number;
  anexos: number;
  atribuicoes: number;
  erro?: string;
}

/**
 * Backfill manual: traz do sistema antigo de tickets (ainda em uso) tudo que
 * foi criado por lá e ainda não existe no Núcleo — comparando pelo mesmo `id`
 * usado na migração original de 24/08/2026, então rodar de novo não duplica
 * nada. Só admin pleno aciona (checado na API route).
 */
export async function sincronizarTicketsOrigem(): Promise<ResultadoSincronizacao> {
  const vazio: ResultadoSincronizacao = { novosTickets: 0, comentarios: 0, anexos: 0, atribuicoes: 0 };
  const local = ticketsDb();
  if (!local) return { ...vazio, erro: "Banco do Núcleo não configurado no servidor." };
  const origem = origemDb();
  if (!origem) {
    return {
      ...vazio,
      erro: "Credenciais do sistema antigo não configuradas (TICKETS_ORIGEM_SUPABASE_URL / TICKETS_ORIGEM_SERVICE_ROLE_KEY no .env.local).",
    };
  }

  const { data: existentes, error: eLocal } = await local.from("tickets").select("id");
  if (eLocal) return { ...vazio, erro: `Falha ao ler tickets do Núcleo: ${eLocal.message}` };
  const idsLocais = new Set((existentes ?? []).map((r) => (r as { id: string }).id));

  const { data: todosOrigem, error: eOrigem } = await origem.from("tickets").select("*");
  if (eOrigem) return { ...vazio, erro: `Falha ao ler o sistema antigo: ${eOrigem.message}` };

  const novos = (todosOrigem ?? []).filter((t) => !idsLocais.has((t as { id: string }).id));
  if (novos.length === 0) return vazio;
  const novosIds = novos.map((t) => (t as { id: string }).id);

  const [comentarios, anexos, atribuicoes] = await Promise.all([
    origem.from("ticket_comments").select("*").in("ticket_id", novosIds),
    origem.from("ticket_attachments").select("*").in("ticket_id", novosIds),
    origem.from("ticket_assignees").select("*").in("ticket_id", novosIds),
  ]);

  const { error: eIns } = await local.from("tickets").insert(novos);
  if (eIns) return { ...vazio, erro: `Falha ao gravar os tickets novos no Núcleo: ${eIns.message}` };

  let nComentarios = 0, nAnexos = 0, nAtribuicoes = 0;
  if (comentarios.data?.length) {
    const { error } = await local.from("ticket_comments").insert(comentarios.data);
    if (!error) nComentarios = comentarios.data.length;
  }
  if (anexos.data?.length) {
    const { error } = await local.from("ticket_attachments").insert(anexos.data);
    if (!error) nAnexos = anexos.data.length;
  }
  if (atribuicoes.data?.length) {
    const { error } = await local.from("ticket_assignees").insert(atribuicoes.data);
    if (!error) nAtribuicoes = atribuicoes.data.length;
  }

  return { novosTickets: novos.length, comentarios: nComentarios, anexos: nAnexos, atribuicoes: nAtribuicoes };
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
