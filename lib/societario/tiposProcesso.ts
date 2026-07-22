// CRUD dos tipos de processo.
// Usa Supabase quando configurado, senão arquivo local em .data/.

import fs from "node:fs/promises";
import path from "node:path";
import { TIPOS_PROCESSO_DEFAULT } from "./options";
import { isSupabaseConfigured } from "./supabase";
import {
  sbCreateTipo,
  sbDeleteTipo,
  sbListTipos,
  sbUpdateTipo,
} from "./supabase-store";

export interface TipoProcesso {
  id: string;
  name: string;
  active: boolean;
  segment?: string;
}

const DB = path.join(process.cwd(), ".data", "tipos-processo.json");

async function ensureFile(): Promise<TipoProcesso[]> {
  try {
    const raw = await fs.readFile(DB, "utf-8");
    return JSON.parse(raw) as TipoProcesso[];
  } catch {
    const seed: TipoProcesso[] = TIPOS_PROCESSO_DEFAULT.map((t, i) => ({
      id: `t${i + 1}`,
      name: t.name,
      active: t.active,
      segment: "Societário",
    }));
    await fs.mkdir(path.dirname(DB), { recursive: true });
    await fs.writeFile(DB, JSON.stringify(seed, null, 2), "utf-8");
    return seed;
  }
}

export async function listTipos(): Promise<TipoProcesso[]> {
  if (isSupabaseConfigured()) {
    return sbListTipos();
  }
  const all = await ensureFile();
  return all.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function listTiposAtivos(): Promise<TipoProcesso[]> {
  return (await listTipos()).filter((t) => t.active);
}

export async function createTipo(
  data: Omit<TipoProcesso, "id">
): Promise<TipoProcesso> {
  if (isSupabaseConfigured()) {
    return sbCreateTipo(data);
  }
  const all = await ensureFile();
  const id = `t${Date.now().toString(36)}`;
  const novo: TipoProcesso = { id, ...data };
  all.push(novo);
  await fs.writeFile(DB, JSON.stringify(all, null, 2), "utf-8");
  return novo;
}

export async function updateTipo(
  id: string,
  patch: Partial<TipoProcesso>
): Promise<TipoProcesso | null> {
  if (isSupabaseConfigured()) {
    return sbUpdateTipo(id, patch);
  }
  const all = await ensureFile();
  const i = all.findIndex((t) => t.id === id);
  if (i < 0) return null;
  all[i] = { ...all[i], ...patch, id };
  await fs.writeFile(DB, JSON.stringify(all, null, 2), "utf-8");
  return all[i];
}

export async function deleteTipo(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    return sbDeleteTipo(id);
  }
  const all = await ensureFile();
  const next = all.filter((t) => t.id !== id);
  if (next.length === all.length) return false;
  await fs.writeFile(DB, JSON.stringify(next, null, 2), "utf-8");
  return true;
}
