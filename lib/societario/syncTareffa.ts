// Sync incremental da API do Tareffa → Supabase.
// Versão "biblioteca" (sem prints / sem process.exit) usada pelo cron HTTP
// em /api/societario/cron/sync-tareffa. Para o sync histórico completo via CLI, use
// scripts/sync-tareffa.ts.

import { supabaseAdmin } from "./supabase";
import { getSocietalSituation, daysAgo, type SocietalIndicator } from "./tareffa";

export interface SyncResult {
  ok: boolean;
  windows: number;
  fetched: number;
  inserted: number;
  updated: number;
  activities: number;
  durationMs: number;
  errors: string[];
}

export interface SyncOptions {
  /** Quantidade de janelas de 30 dias para trás a varrer. Default: 2 (≈60 dias). */
  windows?: number;
  /** Modo de range. Default "updated" para pegar mudanças recentes. */
  mode?: "updated" | "started";
}

/**
 * Sincroniza processos + atividades do Tareffa no Supabase.
 *
 * Estratégia:
 *  - Varre N janelas de 30 dias para trás (limite da API Tareffa).
 *  - Insere processos novos (chave: external_id).
 *  - Atualiza status / closed_in / updated_in / bearer dos existentes.
 *  - Substitui (delete + insert) as atividades dos processos tocados.
 */
export async function syncTareffaToSupabase(
  opts: SyncOptions = {}
): Promise<SyncResult> {
  const t0 = Date.now();
  const windows = Math.max(1, Math.min(opts.windows ?? 2, 24));
  const mode = opts.mode ?? "updated";
  const errors: string[] = [];

  // ---------- 1. Coleta da API ----------
  const indicatorsById = new Map<number, SocietalIndicator>();
  for (let i = 0; i < windows; i++) {
    const to = daysAgo(i * 30);
    const from = daysAgo(i * 30 + 30);
    try {
      const resp = await getSocietalSituation({ mode, from, to });
      for (const ind of resp.indicators) {
        indicatorsById.set(ind.id, ind);
      }
    } catch (e) {
      errors.push(`window ${from}->${to}: ${(e as Error).message}`);
    }
  }

  const indicators = Array.from(indicatorsById.values());
  if (indicators.length === 0) {
    return {
      ok: errors.length === 0,
      windows,
      fetched: 0,
      inserted: 0,
      updated: 0,
      activities: 0,
      durationMs: Date.now() - t0,
      errors,
    };
  }

  const sb = supabaseAdmin();

  // ---------- 2. Mapa external_id -> id local ----------
  const procIdByExternal = new Map<number, number>();
  {
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      const { data, error } = await sb
        .from("processos")
        .select("id, external_id")
        .not("external_id", "is", null)
        .range(offset, offset + PAGE - 1);
      if (error) {
        errors.push(`list processos: ${error.message}`);
        break;
      }
      if (!data || data.length === 0) break;
      for (const p of data as Array<{ id: number; external_id: number | null }>) {
        if (p.external_id) procIdByExternal.set(p.external_id, p.id);
      }
      if (data.length < PAGE) break;
      offset += PAGE;
    }
  }

  // ---------- 3. Inserir processos novos ----------
  let inserted = 0;
  const novosProcs = indicators
    .filter((i) => !procIdByExternal.has(i.id))
    .map((i) => ({
      external_id: i.id,
      name: i.name,
      inscription: i.inscription || null,
      bearer: i.bearer,
      process: i.process,
      status: (i.status || "").toUpperCase(),
      started_in: i.started_in || null,
      closed_in: i.closed_in,
      updated_in: i.updated_in,
      value: i.value,
      proposal: i.proposal,
      source: "api" as const,
    }));

  for (let i = 0; i < novosProcs.length; i += 500) {
    const batch = novosProcs.slice(i, i + 500);
    const { data, error } = await sb
      .from("processos")
      .insert(batch)
      .select("id, external_id");
    if (error) {
      errors.push(`insert processos batch ${i}: ${error.message}`);
      continue;
    }
    for (const r of (data || []) as Array<{
      id: number;
      external_id: number | null;
    }>) {
      if (r.external_id) procIdByExternal.set(r.external_id, r.id);
      inserted++;
    }
  }

  // ---------- 4. Atualizar processos existentes ----------
  const toUpdate = indicators.filter((i) => procIdByExternal.has(i.id));
  let updated = 0;
  const CONCURRENCY = 8;
  for (let i = 0; i < toUpdate.length; i += CONCURRENCY) {
    const slice = toUpdate.slice(i, i + CONCURRENCY);
    await Promise.all(
      slice.map(async (ind) => {
        const id = procIdByExternal.get(ind.id)!;
        const { error } = await sb
          .from("processos")
          .update({
            status: (ind.status || "").toUpperCase(),
            closed_in: ind.closed_in,
            updated_in: ind.updated_in,
            bearer: ind.bearer || undefined,
          })
          .eq("id", id);
        if (error) {
          errors.push(`update processo ${id}: ${error.message}`);
          return;
        }
        updated++;
      })
    );
  }

  // ---------- 5. Substituir atividades dos processos tocados ----------
  const touchedProcessoIds = new Set<number>();
  for (const ind of indicators) {
    const id = procIdByExternal.get(ind.id);
    if (id) touchedProcessoIds.add(id);
  }
  const procIdsArr = Array.from(touchedProcessoIds);

  for (let i = 0; i < procIdsArr.length; i += 200) {
    const batch = procIdsArr.slice(i, i + 200);
    const { error } = await sb
      .from("atividades")
      .delete()
      .in("processo_id", batch);
    if (error) errors.push(`delete atividades batch ${i}: ${error.message}`);
  }

  const atividadesToInsert: Array<{
    external_id: number;
    processo_id: number;
    name: string;
    responsible: string | null;
    situation: string | null;
    ordering: string;
    deadline_in: string | null;
    closed_in: string | null;
    updated_in: string;
  }> = [];
  for (const ind of indicators) {
    const procId = procIdByExternal.get(ind.id);
    if (!procId) continue;
    for (const a of ind.activities || []) {
      atividadesToInsert.push({
        external_id: a.id,
        processo_id: procId,
        name: a.name,
        responsible: a.responsible,
        situation: a.situation,
        ordering: a.order || "",
        deadline_in: a.deadline_in,
        closed_in: a.closed_in,
        updated_in: a.updated_in,
      });
    }
  }

  let activitiesInserted = 0;
  for (let i = 0; i < atividadesToInsert.length; i += 500) {
    const batch = atividadesToInsert.slice(i, i + 500);
    const { error } = await sb.from("atividades").insert(batch);
    if (error) {
      errors.push(`insert atividades batch ${i}: ${error.message}`);
      continue;
    }
    activitiesInserted += batch.length;
  }

  return {
    ok: errors.length === 0,
    windows,
    fetched: indicators.length,
    inserted,
    updated,
    activities: activitiesInserted,
    durationMs: Date.now() - t0,
    errors,
  };
}
