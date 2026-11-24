// Grupos de processamento do DP (Questor), por código de empresa. SERVIDOR.
// Vindo de app-empresas-integra/lib/syncCore.mjs (atualizarGruposProcessamento).
// Leitura grátis no Questor; guardado em grupos_processamento para os filtros.
// Uma empresa pode estar em VÁRIOS grupos (Questor: grupoempresa) — guarda todos.

import { getGruposProcessamento } from "./questor";
import { db } from "./serpro/servidor";

export interface Grupo { c: number; d: string | null }

const VALIDADE_MS = 12 * 60 * 60 * 1000;

/** Busca no Questor e grava todos os pares empresa × grupo. Os que sumiram são apagados. */
export async function atualizarGrupos() {
  const { dados } = await getGruposProcessamento();
  const agora = new Date().toISOString();
  const pares = new Map<string, Record<string, unknown>>();
  for (const r of dados) {
    const cod = Number(r.codigoempresa), g = Number(r.codigogrupoproc);
    if (!Number.isFinite(cod) || r.codigogrupoproc == null || !Number.isFinite(g)) continue;
    pares.set(`${cod}-${g}`, { codigoempresa: cod, grupo_codigo: g, grupo_desc: r.descrgrupoproc || null, updated_at: agora });
  }
  const rows = [...pares.values()];
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db().from("grupos_processamento").upsert(rows.slice(i, i + 500), { onConflict: "codigoempresa,grupo_codigo" });
    if (error) throw new Error(error.message);
  }
  if (rows.length) await db().from("grupos_processamento").delete().lt("updated_at", agora);
  return { recebidos: rows.length };
}

/** Mapa codigoempresa -> grupos. Atualiza antes se a leitura tiver mais de 12 h (falha não impede). */
export async function mapaGrupos(atualizarSeVelho = false): Promise<Map<number, Grupo[]>> {
  // o Supabase devolve no máximo 1000 linhas por consulta: lê em páginas
  const ler = async () => {
    const tudo: { codigoempresa: number; grupo_codigo: number; grupo_desc: string | null; updated_at: string }[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await db().from("grupos_processamento")
        .select("codigoempresa, grupo_codigo, grupo_desc, updated_at")
        .order("codigoempresa").order("grupo_codigo").range(de, de + 999);
      if (error) throw new Error(error.message);
      tudo.push(...(data ?? []));
      if (!data || data.length < 1000) return tudo;
    }
  };
  let dados = await ler();
  if (atualizarSeVelho) {
    const ultima = Math.max(0, ...dados.map((d) => Date.parse(d.updated_at as string) || 0));
    if (Date.now() - ultima > VALIDADE_MS) {
      try { await atualizarGrupos(); dados = await ler(); } catch { /* segue com o que tem */ }
    }
  }
  const m = new Map<number, Grupo[]>();
  for (const d of dados) {
    const k = Number(d.codigoempresa);
    (m.get(k) ?? m.set(k, []).get(k)!).push({ c: Number(d.grupo_codigo), d: (d.grupo_desc as string | null) ?? null });
  }
  return m;
}

/** Aplica os grupos nas linhas (por codigoempresa); grupo_desc = todos, para o CSV. */
export function comGrupo<T extends { codigoempresa: number | null }>(linhas: T[], mapa: Map<number, Grupo[]>) {
  return linhas.map((l) => {
    const grupos = (l.codigoempresa != null ? mapa.get(Number(l.codigoempresa)) : undefined) ?? [];
    return { ...l, grupos, grupo_desc: grupos.map((g) => g.d ?? `Grupo ${g.c}`).join(" | ") || null };
  });
}
