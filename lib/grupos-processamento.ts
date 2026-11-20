// Grupos de processamento do DP (Questor), por código de empresa. SERVIDOR.
// Vindo de app-empresas-integra/lib/syncCore.mjs (atualizarGruposProcessamento).
// Leitura grátis no Questor; guardado em grupos_processamento para os filtros.

import { getGruposProcessamento } from "./questor";
import { db } from "./serpro/servidor";

export interface Grupo { grupo_codigo: number | null; grupo_desc: string | null }

const VALIDADE_MS = 12 * 60 * 60 * 1000;

/** Busca no Questor e grava. Empresas que saíram de grupo ficam sem grupo. */
export async function atualizarGrupos() {
  const { dados } = await getGruposProcessamento();
  const agora = new Date().toISOString();
  const porEmp = new Map<number, Record<string, unknown>>();
  for (const r of dados) {
    const cod = Number(r.codigoempresa);
    if (!Number.isFinite(cod)) continue;
    porEmp.set(cod, {
      codigoempresa: cod,
      grupo_codigo: r.codigogrupoproc == null ? null : Number(r.codigogrupoproc),
      grupo_desc: r.descrgrupoproc || null,
      updated_at: agora,
    });
  }
  const rows = [...porEmp.values()];
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db().from("grupos_processamento").upsert(rows.slice(i, i + 500), { onConflict: "codigoempresa" });
    if (error) throw new Error(error.message);
  }
  // quem não veio nesta leitura saiu do grupo
  if (rows.length) await db().from("grupos_processamento").delete().lt("updated_at", agora);
  return { recebidos: rows.length };
}

/** Mapa codigoempresa -> grupo. Atualiza antes se a leitura tiver mais de 12 h (falha não impede). */
export async function mapaGrupos(atualizarSeVelho = false): Promise<Map<number, Grupo>> {
  const ler = async () => {
    const { data, error } = await db().from("grupos_processamento")
      .select("codigoempresa, grupo_codigo, grupo_desc, updated_at").limit(20000);
    if (error) throw new Error(error.message);
    return data ?? [];
  };
  let dados = await ler();
  if (atualizarSeVelho) {
    const ultima = Math.max(0, ...dados.map((d) => Date.parse(d.updated_at as string) || 0));
    if (Date.now() - ultima > VALIDADE_MS) {
      try { await atualizarGrupos(); dados = await ler(); } catch { /* segue com o que tem */ }
    }
  }
  return new Map(dados.map((d) => [Number(d.codigoempresa), { grupo_codigo: d.grupo_codigo as number | null, grupo_desc: d.grupo_desc as string | null }]));
}

/** Aplica o grupo nas linhas (por codigoempresa). */
export function comGrupo<T extends { codigoempresa: number | null }>(linhas: T[], mapa: Map<number, Grupo>): (T & Grupo)[] {
  return linhas.map((l) => ({ ...l, ...(l.codigoempresa != null ? mapa.get(Number(l.codigoempresa)) : null) ?? { grupo_codigo: null, grupo_desc: null } }));
}
