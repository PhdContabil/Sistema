// Ajustes de situação feitos no Núcleo em atividades que vêm do Tareffa.
// A sincronização apaga e recria as atividades; sem isto, "Concluído"/"Não se aplica"
// marcado aqui voltaria a ficar em aberto. Vale o mais recente (Núcleo x Tareffa).
// JSON no bucket privado "cache-nucleo" (sem tabela nova).
import { supabaseAdmin } from "./supabase";

const BUCKET = "cache-nucleo";
const ARQ = "societario-ajustes-atividade.json";

export interface AjusteAtividade { situation: string | null; closed_in: string | null; em: string; obs?: string | null }

export async function lerAjustesAtividade(): Promise<Record<string, AjusteAtividade>> {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(ARQ);
  if (error || !data) return {};
  try { return JSON.parse(await data.text()) as Record<string, AjusteAtividade>; } catch { return {}; }
}

export async function salvarAjusteAtividade(externalId: number, aj: AjusteAtividade): Promise<void> {
  const mapa = await lerAjustesAtividade();
  mapa[String(externalId)] = aj;
  await supabaseAdmin().storage.from(BUCKET).upload(
    ARQ, new Blob([JSON.stringify(mapa)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
}
