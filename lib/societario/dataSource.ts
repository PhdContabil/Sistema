// Camada de dados unificada.
//
// Modos:
//  - Supabase configurado → usa Postgres como fonte única (read/write).
//  - Sem Supabase → usa CSVs locais + JSON em .data/ (dev).
//
// A API do Tareffa pode ser usada como sync periódico (opt-in via TAREFFA_USE_API=true).

import fs from "node:fs/promises";
import path from "node:path";
import {
  type SocietalIndicator,
  type SocietalActivity,
  getSocietalSituation,
} from "./tareffa";
import { brDateToIso, csvToObjects, stripHtml } from "./csv";
import { canonicalResponsavel } from "./options";
import { isSupabaseConfigured } from "./supabase";
import {
  sbCreateProcesso,
  sbDeleteProcesso,
  sbListProcessos,
  sbUpdateActivitySituation,
  sbUpdateProcesso,
} from "./supabase-store";

const ROOT = process.cwd();
const CSV_PROCESSOS = path.join(ROOT, "processo_Societario.csv");
const CSV_ESTABS = path.join(ROOT, "estabelecimentos.csv");
const LOCAL_DB = path.join(ROOT, ".data", "processos-locais.json");
const OVERRIDES_DB = path.join(ROOT, ".data", "activity-overrides.json");

const USE_API = process.env.TAREFFA_USE_API === "true";

export interface UnifiedProcesso extends SocietalIndicator {
  source: "api" | "csv" | "local";
  inscriptionType?: string;
  category?: string;
  nextActivity?: string;
}

export interface DataSnapshot {
  processos: UnifiedProcesso[];
  loadedAt: string;
  apiOk: boolean;
  apiError: string | null;
  csvOk: boolean;
  csvRows: number;
  storage: "supabase" | "local";
}

// ---- Caches ----
let csvCache: UnifiedProcesso[] | null = null;
let apiCache: UnifiedProcesso[] | null = null;
let apiCacheUntil = 0;
let sbCache: UnifiedProcesso[] | null = null;
let sbCacheUntil = 0;
const API_TTL = 10 * 60 * 1000;
const SB_TTL = 60 * 1000; // 1 min — pequeno para refletir edições rapidamente

// ---- CSV (carregado uma vez) ----
async function loadCSV(): Promise<UnifiedProcesso[]> {
  if (csvCache) return csvCache;
  try {
    const text = await fs.readFile(CSV_PROCESSOS, "utf-8");
    const rows = csvToObjects(text);

    let cnpjMap = new Map<string, string>();
    try {
      const estabText = await fs.readFile(CSV_ESTABS, "utf-8");
      const estabRows = csvToObjects(estabText);
      for (const r of estabRows) {
        const razao = (r["razão social"] || "").trim();
        const insc = (r["inscrição federal"] || "").trim();
        if (razao && insc) cnpjMap.set(razao, insc);
      }
    } catch {}

    csvCache = rows.map((r, i) => {
      const id = Number(r["ID"]) || 1_000_000 + i;
      const nome = r["nome do cliente"] || r["cliente"] || "(sem nome)";
      const proc = r["processo"] || "";
      const responsaveis = stripHtml(r["responsáveis"] || "");
      const statusRaw = stripHtml(r["status"] || "");
      const status = statusRaw.toUpperCase();
      const dataInicio = brDateToIso(r["data início"] || "");
      const ultimaData = brDateToIso(r["última data"] || "");
      const proximo = r["próximo"] || "";
      const categoria = r["categoria"] || "";
      const inscription = cnpjMap.get(nome) || "";

      return {
        id,
        name: nome,
        inscription,
        bearer: r["parceiro"] || responsaveis || null,
        process: proc,
        status,
        started_in: dataInicio || "",
        value: null,
        proposal: null,
        closed_in: status.includes("CONCL") ? ultimaData : null,
        updated_in: ultimaData || dataInicio || "",
        activities: [],
        source: "csv" as const,
        category: categoria,
        nextActivity: stripHtml(proximo),
      };
    });
    return csvCache;
  } catch {
    csvCache = [];
    return csvCache;
  }
}

// ---- API (opt-in) ----
async function loadAPI(): Promise<{
  ok: boolean;
  error: string | null;
  processos: UnifiedProcesso[];
}> {
  if (!USE_API) return { ok: false, error: null, processos: [] };
  const now = Date.now();
  if (apiCache && now < apiCacheUntil) {
    return { ok: true, error: null, processos: apiCache };
  }
  try {
    const today = new Date();
    const collected = new Map<number, UnifiedProcesso>();
    const totalWindows = 24;
    for (let i = 0; i < totalWindows; i++) {
      const end = new Date(today);
      end.setUTCDate(end.getUTCDate() - i * 30);
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 30);
      const from = start.toISOString().slice(0, 10);
      const to = end.toISOString().slice(0, 10);
      try {
        const resp = await getSocietalSituation({ mode: "updated", from, to });
        for (const ind of resp.indicators) {
          collected.set(ind.id, { ...ind, source: "api" });
        }
      } catch {}
    }
    apiCache = Array.from(collected.values());
    apiCacheUntil = now + API_TTL;
    return { ok: collected.size > 0, error: null, processos: apiCache };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      processos: [],
    };
  }
}

// ---- Local JSON DB ----
async function loadLocalJsonProcessos(): Promise<UnifiedProcesso[]> {
  try {
    const text = await fs.readFile(LOCAL_DB, "utf-8");
    const arr = JSON.parse(text) as UnifiedProcesso[];
    return arr.map((p) => ({ ...p, source: "local" as const }));
  } catch {
    return [];
  }
}

async function saveLocalJsonProcesso(p: UnifiedProcesso): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_DB), { recursive: true });
  const cur = await loadLocalJsonProcessos();
  cur.push({ ...p, source: "local" });
  await fs.writeFile(LOCAL_DB, JSON.stringify(cur, null, 2), "utf-8");
}

async function updateLocalJsonProcesso(
  id: number,
  patch: Partial<UnifiedProcesso>
): Promise<UnifiedProcesso | null> {
  const cur = await loadLocalJsonProcessos();
  const i = cur.findIndex((p) => p.id === id);
  if (i < 0) return null;
  cur[i] = { ...cur[i], ...patch, id, source: "local" };
  await fs.writeFile(LOCAL_DB, JSON.stringify(cur, null, 2), "utf-8");
  return cur[i];
}

async function deleteLocalJsonProcesso(id: number): Promise<boolean> {
  const cur = await loadLocalJsonProcessos();
  const next = cur.filter((p) => p.id !== id);
  if (next.length === cur.length) return false;
  await fs.writeFile(LOCAL_DB, JSON.stringify(next, null, 2), "utf-8");
  return true;
}

// ---- Public API: Local processos ----
export async function loadLocalProcessos(): Promise<UnifiedProcesso[]> {
  if (isSupabaseConfigured()) return [];
  return loadLocalJsonProcessos();
}

export async function saveLocalProcesso(
  p: UnifiedProcesso
): Promise<number> {
  if (isSupabaseConfigured()) {
    const id = await sbCreateProcesso(p);
    invalidateSupabaseCache();
    return id;
  }
  await saveLocalJsonProcesso(p);
  return p.id;
}

export async function updateLocalProcesso(
  id: number,
  patch: Partial<UnifiedProcesso>
): Promise<UnifiedProcesso | null> {
  if (isSupabaseConfigured()) {
    await sbUpdateProcesso(id, patch);
    invalidateSupabaseCache();
    return null;
  }
  return updateLocalJsonProcesso(id, patch);
}

export async function deleteLocalProcesso(id: number): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const ok = await sbDeleteProcesso(id);
    invalidateSupabaseCache();
    return ok;
  }
  return deleteLocalJsonProcesso(id);
}

export function nextLocalId(existing: UnifiedProcesso[]): number {
  let max = 9_000_000;
  for (const p of existing) if (p.id > max) max = p.id;
  return max + 1;
}

// ---- Activity overrides (apenas modo local) ----
interface ActivityOverride {
  situation?: string | null;
  closed_in?: string | null;
  updated_at: string;
}

async function loadOverrides(): Promise<Map<number, ActivityOverride>> {
  try {
    const txt = await fs.readFile(OVERRIDES_DB, "utf-8");
    const obj = JSON.parse(txt) as Record<string, ActivityOverride>;
    const m = new Map<number, ActivityOverride>();
    for (const [k, v] of Object.entries(obj)) m.set(Number(k), v);
    return m;
  } catch {
    return new Map();
  }
}

async function saveOverrides(
  m: Map<number, ActivityOverride>
): Promise<void> {
  await fs.mkdir(path.dirname(OVERRIDES_DB), { recursive: true });
  const obj: Record<string, ActivityOverride> = {};
  for (const [k, v] of m.entries()) obj[k] = v;
  await fs.writeFile(OVERRIDES_DB, JSON.stringify(obj, null, 2), "utf-8");
}

export async function updateActivitySituation(
  processoId: number,
  activityId: number,
  situation: string | null
): Promise<void> {
  if (isSupabaseConfigured()) {
    await sbUpdateActivitySituation(activityId, situation);
    invalidateSupabaseCache();
    return;
  }
  // modo local: tenta no JSON e cai no overrides file
  const locais = await loadLocalJsonProcessos();
  const local = locais.find((p) => p.id === processoId);
  if (local) {
    const idx = local.activities.findIndex((a) => a.id === activityId);
    if (idx >= 0) {
      local.activities[idx] = {
        ...local.activities[idx],
        situation,
        updated_in: new Date().toISOString(),
        closed_in:
          situation && situation.toUpperCase().includes("CONCL")
            ? new Date().toISOString().slice(0, 10)
            : local.activities[idx].closed_in,
      };
      await fs.writeFile(LOCAL_DB, JSON.stringify(locais, null, 2), "utf-8");
      return;
    }
  }
  const m = await loadOverrides();
  m.set(activityId, {
    situation,
    closed_in:
      situation && situation.toUpperCase().includes("CONCL")
        ? new Date().toISOString().slice(0, 10)
        : null,
    updated_at: new Date().toISOString(),
  });
  await saveOverrides(m);
}

function applyOverrides(
  procs: UnifiedProcesso[],
  overrides: Map<number, ActivityOverride>
): UnifiedProcesso[] {
  if (overrides.size === 0) return procs;
  return procs.map((p) => {
    if (p.activities.length === 0) return p;
    const acts = p.activities.map((a) => {
      const ov = overrides.get(a.id);
      if (!ov) return a;
      return {
        ...a,
        situation: ov.situation ?? a.situation,
        closed_in: ov.closed_in ?? a.closed_in,
        updated_in: ov.updated_at,
      };
    });
    return { ...p, activities: acts };
  });
}

// ---- Loader Supabase ----
function invalidateSupabaseCache() {
  sbCache = null;
  sbCacheUntil = 0;
}

async function loadFromSupabase(): Promise<UnifiedProcesso[]> {
  const now = Date.now();
  if (sbCache && now < sbCacheUntil) return sbCache;
  sbCache = await sbListProcessos();
  sbCacheUntil = now + SB_TTL;
  return sbCache;
}

// ---- Loader principal ----
export async function loadAll(): Promise<DataSnapshot> {
  // Modo Supabase: fonte única
  if (isSupabaseConfigured()) {
    let processos: UnifiedProcesso[] = [];
    let apiError: string | null = null;
    try {
      processos = await loadFromSupabase();
    } catch (e) {
      apiError = e instanceof Error ? e.message : String(e);
    }
    return {
      processos,
      loadedAt: new Date().toISOString(),
      apiOk: false,
      apiError,
      csvOk: false,
      csvRows: 0,
      storage: "supabase",
    };
  }

  // Modo local: CSV + API opt-in + JSON local + overrides
  const csv = await loadCSV();
  const api = await loadAPI();
  const local = await loadLocalJsonProcessos();
  const overrides = await loadOverrides();

  const map = new Map<string | number, UnifiedProcesso>();
  for (const p of csv) map.set(p.id, p);
  for (const p of api.processos) map.set(p.id, p);
  for (const p of local) map.set(p.id, p);

  let merged = Array.from(map.values()).sort((a, b) => {
    const da = a.updated_in || a.started_in || "";
    const db = b.updated_in || b.started_in || "";
    return db.localeCompare(da);
  });
  merged = applyOverrides(merged, overrides);

  return {
    processos: merged,
    loadedAt: new Date().toISOString(),
    apiOk: api.ok,
    apiError: api.error,
    csvOk: csv.length > 0,
    csvRows: csv.length,
    storage: "local",
  };
}

// ---- Métricas ----
export interface Stats {
  total: number;
  emAberto: number;
  concluido: number;
  pendente: number;
  cancelado: number;
  empresasUnicas: number;
  porTipo: { name: string; count: number }[];
  porStatus: { name: string; count: number }[];
  porResponsavel: {
    name: string;
    count: number;
    concluidos: number;
    abertos: number;
  }[];
  porAno: { ano: string; count: number }[];
  porMes: { mes: string; count: number; abertos: number; concluidos: number }[];
  porSemana: {
    semana: string;
    count: number;
    abertos: number;
    concluidos: number;
  }[];
  recentes: UnifiedProcesso[];
}

interface RespBucket {
  count: number;
  concluidos: number;
  abertos: number;
}
interface MesBucket {
  count: number;
  abertos: number;
  concluidos: number;
}

export function weekKey(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const d = new Date(iso + "T00:00:00Z");
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7
    );
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function computeStats(processos: UnifiedProcesso[]): Stats {
  let emAberto = 0;
  let concluido = 0;
  let pendente = 0;
  let cancelado = 0;
  const empresas = new Set<string>();
  const porTipo = new Map<string, number>();
  const porStatus = new Map<string, number>();
  const porResp = new Map<string, RespBucket>();
  const porAno = new Map<string, number>();
  const porMes = new Map<string, MesBucket>();
  const porSemana = new Map<string, MesBucket>();

  for (const p of processos) {
    const s = (p.status || "").toUpperCase();
    const isConcl = s.includes("CONCL");
    const isCancel = s.includes("CANCEL");
    const isPend =
      s.includes("AGUARD") || s.includes("PEND") || s.includes("PARAD");
    if (isConcl) concluido++;
    else if (isCancel) cancelado++;
    else if (isPend) pendente++;
    else emAberto++;

    empresas.add(p.inscription || p.name);
    porTipo.set(p.process, (porTipo.get(p.process) || 0) + 1);
    porStatus.set(s || "—", (porStatus.get(s || "—") || 0) + 1);

    const canonical = canonicalResponsavel(p.bearer);
    if (canonical) {
      const rb = porResp.get(canonical) || {
        count: 0,
        concluidos: 0,
        abertos: 0,
      };
      rb.count++;
      if (isConcl) rb.concluidos++;
      else if (!isCancel) rb.abertos++;
      porResp.set(canonical, rb);
    }

    const ano = (p.started_in || "").slice(0, 4) || "—";
    porAno.set(ano, (porAno.get(ano) || 0) + 1);

    const mes = (p.started_in || "").slice(0, 7);
    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      const mb = porMes.get(mes) || { count: 0, abertos: 0, concluidos: 0 };
      mb.count++;
      if (isConcl) mb.concluidos++;
      else if (!isCancel) mb.abertos++;
      porMes.set(mes, mb);
    }

    const wk = weekKey(p.started_in || "");
    if (wk) {
      const wb = porSemana.get(wk) || {
        count: 0,
        abertos: 0,
        concluidos: 0,
      };
      wb.count++;
      if (isConcl) wb.concluidos++;
      else if (!isCancel) wb.abertos++;
      porSemana.set(wk, wb);
    }
  }

  const sortDesc = (m: Map<string, number>) =>
    Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

  return {
    total: processos.length,
    emAberto,
    concluido,
    pendente,
    cancelado,
    empresasUnicas: empresas.size,
    porTipo: sortDesc(porTipo),
    porStatus: sortDesc(porStatus),
    porResponsavel: Array.from(porResp.entries())
      .map(([name, b]) => ({
        name,
        count: b.count,
        concluidos: b.concluidos,
        abertos: b.abertos,
      }))
      .sort((a, b) => b.count - a.count),
    porAno: Array.from(porAno.entries())
      .map(([ano, count]) => ({ ano, count }))
      .filter((x) => x.ano !== "—")
      .sort((a, b) => a.ano.localeCompare(b.ano)),
    porMes: Array.from(porMes.entries())
      .map(([mes, b]) => ({
        mes,
        count: b.count,
        abertos: b.abertos,
        concluidos: b.concluidos,
      }))
      .sort((a, b) => a.mes.localeCompare(b.mes)),
    porSemana: Array.from(porSemana.entries())
      .map(([semana, b]) => ({
        semana,
        count: b.count,
        abertos: b.abertos,
        concluidos: b.concluidos,
      }))
      .sort((a, b) => a.semana.localeCompare(b.semana)),
    recentes: processos.slice(0, 10),
  };
}
