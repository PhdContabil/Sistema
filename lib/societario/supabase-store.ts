// Loja de dados baseada em Supabase.
// Apenas usada quando isSupabaseConfigured() === true.

import { supabaseAdmin } from "./supabase";
import type { SocietalActivity, SocietalIndicator } from "./tareffa";
import type { UnifiedProcesso } from "./dataSource";
import type { TipoProcesso } from "./tiposProcesso";

// ----- Processos -----

interface ProcessoRow {
  id: number;
  external_id: number | null;
  empresa_id: number | null;
  name: string;
  inscription: string | null;
  bearer: string | null;
  process: string;
  status: string | null;
  started_in: string | null;
  closed_in: string | null;
  updated_in: string | null;
  value: number | null;
  proposal: string | null;
  category: string | null;
  next_activity: string | null;
  source: string;
}

interface AtividadeRow {
  id: number;
  external_id: number | null;
  processo_id: number;
  name: string;
  responsible: string | null;
  co_responsible?: string | null;
  situation: string | null;
  ordering: string | null;
  deadline_in: string | null;
  closed_in: string | null;
  updated_in: string;
}

function rowToProcesso(
  r: ProcessoRow,
  acts: AtividadeRow[]
): UnifiedProcesso {
  return {
    id: r.id,
    name: r.name,
    inscription: r.inscription || "",
    bearer: r.bearer,
    process: r.process,
    status: r.status || "",
    started_in: r.started_in || "",
    closed_in: r.closed_in,
    updated_in: r.updated_in || "",
    value: r.value,
    proposal: r.proposal,
    activities: acts.map<SocietalActivity>((a) => ({
      id: a.id,
      name: a.name,
      responsible: a.responsible,
      co_responsible: a.co_responsible ?? null,
      situation: a.situation,
      situation_in: null,
      order: a.ordering || "",
      closed_in: a.closed_in,
      deadline_in: a.deadline_in,
      updated_in: a.updated_in,
    })),
    source: (r.source as "api" | "csv" | "local") || "local",
    category: r.category || undefined,
    nextActivity: r.next_activity || undefined,
  };
}

export async function sbListProcessos(): Promise<UnifiedProcesso[]> {
  const sb = supabaseAdmin();
  // Pagina processos (Supabase limita a 1000 por query)
  const procs: ProcessoRow[] = [];
  const PAGE_P = 1000;
  let offP = 0;
  while (true) {
    const { data: page, error: e1 } = await sb
      .from("processos")
      .select("*")
      .order("updated_in", { ascending: false, nullsFirst: false })
      .range(offP, offP + PAGE_P - 1);
    if (e1) throw new Error(`Supabase processos: ${e1.message}`);
    if (!page || page.length === 0) break;
    procs.push(...(page as ProcessoRow[]));
    if (page.length < PAGE_P) break;
    offP += PAGE_P;
  }
  if (procs.length === 0) return [];

  // Carrega TODAS as atividades paginando (Supabase limita a 1000 por query)
  const actsByProcesso = new Map<number, AtividadeRow[]>();
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data: page, error: e2 } = await sb
      .from("atividades")
      .select("*")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (e2) throw new Error(`Supabase atividades: ${e2.message}`);
    if (!page || page.length === 0) break;
    for (const a of page as AtividadeRow[]) {
      const arr = actsByProcesso.get(a.processo_id) || [];
      arr.push(a);
      actsByProcesso.set(a.processo_id, arr);
    }
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  return (procs as ProcessoRow[]).map((p) =>
    rowToProcesso(p, actsByProcesso.get(p.id) || [])
  );
}

export async function sbCreateProcesso(
  p: Omit<UnifiedProcesso, "id">
): Promise<number> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("processos")
    .insert({
      name: p.name,
      inscription: p.inscription || null,
      bearer: p.bearer,
      process: p.process,
      status: p.status,
      started_in: p.started_in || null,
      closed_in: p.closed_in,
      updated_in: p.updated_in || new Date().toISOString(),
      value: p.value,
      proposal: p.proposal,
      category: p.category || null,
      next_activity: p.nextActivity || null,
      source: "local",
    })
    .select("id")
    .single();
  if (error) throw new Error(`Insert processo: ${error.message}`);

  const processoId = data!.id as number;

  if (p.activities.length > 0) {
    const acts = p.activities.map((a) => ({
      processo_id: processoId,
      name: a.name,
      responsible: a.responsible,
      situation: a.situation,
      ordering: a.order,
      deadline_in: a.deadline_in,
      closed_in: a.closed_in,
      updated_in: a.updated_in,
    }));
    const e2 = await inserirAtividades(sb, acts, p.activities);
    if (e2) throw new Error(`Insert atividades: ${e2}`);
  }

  return processoId;
}

export async function sbUpdateProcesso(
  id: number,
  patch: Partial<UnifiedProcesso>
): Promise<void> {
  const sb = supabaseAdmin();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.inscription !== undefined) update.inscription = patch.inscription;
  if (patch.bearer !== undefined) update.bearer = patch.bearer;
  if (patch.process !== undefined) update.process = patch.process;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.started_in !== undefined) update.started_in = patch.started_in;
  if (patch.closed_in !== undefined) update.closed_in = patch.closed_in;
  if (patch.value !== undefined) update.value = patch.value;
  if (patch.proposal !== undefined) update.proposal = patch.proposal;
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.nextActivity !== undefined)
    update.next_activity = patch.nextActivity;
  update.updated_in = new Date().toISOString();

  const { error } = await sb.from("processos").update(update).eq("id", id);
  if (error) throw new Error(`Update processo: ${error.message}`);

  if (patch.activities) {
    // Apaga as antigas e recria
    await sb.from("atividades").delete().eq("processo_id", id);
    if (patch.activities.length > 0) {
      const acts = patch.activities.map((a) => ({
        processo_id: id,
        name: a.name,
        responsible: a.responsible,
        situation: a.situation,
        ordering: a.order,
        deadline_in: a.deadline_in,
        closed_in: a.closed_in,
        updated_in: a.updated_in,
      }));
      const e2 = await inserirAtividades(sb, acts, patch.activities);
      if (e2) throw new Error(`Insert atividades: ${e2}`);
    }
  }
}

/** Insere as atividades com o corresponsável; se a coluna co_responsible ainda não existir, grava sem ela. */
async function inserirAtividades(
  sb: ReturnType<typeof supabaseAdmin>,
  acts: Record<string, unknown>[],
  origem: SocietalActivity[]
): Promise<string | null> {
  const comCo = acts.map((a, i) => ({ ...a, co_responsible: origem[i]?.co_responsible || null }));
  const r1 = await sb.from("atividades").insert(comCo);
  if (!r1.error) return null;
  if (!/co_responsible/i.test(r1.error.message)) return r1.error.message;
  const r2 = await sb.from("atividades").insert(acts);
  return r2.error ? r2.error.message : null;
}

export async function sbDeleteProcesso(id: number): Promise<boolean> {
  const sb = supabaseAdmin();
  const { error } = await sb.from("processos").delete().eq("id", id);
  if (error) throw new Error(`Delete processo: ${error.message}`);
  return true;
}

export async function sbUpdateActivitySituation(
  activityId: number,
  situation: string | null
): Promise<void> {
  const sb = supabaseAdmin();
  const closed_in = /CONCLU|N[AÃ]O SE APLICA|CANCEL/i.test(situation || "")
    ? new Date().toISOString().slice(0, 10)
    : null;
  const agora = new Date().toISOString();
  const { data, error } = await sb
    .from("atividades")
    .update({ situation, closed_in, updated_in: agora })
    .eq("id", activityId)
    .select("external_id")
    .maybeSingle();
  if (error) throw new Error(`Update atividade: ${error.message}`);
  // Atividade que veio do Tareffa: guarda o ajuste para a próxima sincronização não desfazer.
  const ext = (data as { external_id?: number | null } | null)?.external_id;
  if (ext) {
    const { salvarAjusteAtividade } = await import("./ajustesAtividade");
    await salvarAjusteAtividade(ext, { situation, closed_in, em: agora });
  }
}

// ----- Tipos de processo -----

interface TipoRow {
  id: number;
  name: string;
  segment: string | null;
  active: boolean;
}

function rowToTipo(r: TipoRow): TipoProcesso {
  return {
    id: String(r.id),
    name: r.name,
    segment: r.segment || "Societário",
    active: r.active,
  };
}

export async function sbListTipos(): Promise<TipoProcesso[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("tipos_processo")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(`List tipos: ${error.message}`);
  return ((data || []) as TipoRow[]).map(rowToTipo);
}

export async function sbCreateTipo(
  data: Omit<TipoProcesso, "id">
): Promise<TipoProcesso> {
  const sb = supabaseAdmin();
  const { data: row, error } = await sb
    .from("tipos_processo")
    .insert({
      name: data.name,
      segment: data.segment || "Societário",
      active: data.active,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Create tipo: ${error.message}`);
  return rowToTipo(row as TipoRow);
}

export async function sbUpdateTipo(
  id: string,
  patch: Partial<TipoProcesso>
): Promise<TipoProcesso | null> {
  const sb = supabaseAdmin();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.segment !== undefined) update.segment = patch.segment;
  if (patch.active !== undefined) update.active = patch.active;
  const { data, error } = await sb
    .from("tipos_processo")
    .update(update)
    .eq("id", Number(id))
    .select("*")
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Update tipo: ${error.message}`);
  }
  return rowToTipo(data as TipoRow);
}

export async function sbDeleteTipo(id: string): Promise<boolean> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("tipos_processo")
    .delete()
    .eq("id", Number(id));
  if (error) throw new Error(`Delete tipo: ${error.message}`);
  return true;
}
