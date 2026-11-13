// "Em que etapa o processo está parado" (como a coluna do Tareffa: "05/11 - Aguardando pagamento").
// Texto curto por processo, guardado como JSON no bucket privado "cache-nucleo" (sem tabela nova) —
// fica fora das tabelas que a sincronização do Tareffa reescreve, então não é sobrescrito.
import { supabaseAdmin } from "./supabase";

const BUCKET = "cache-nucleo";
const ARQ = "societario-etapa-processo.json";

export interface EtapaProcesso { texto: string; em: string; por: string | null }

export async function lerEtapas(): Promise<Record<string, EtapaProcesso>> {
  // Lê por URL assinada com cache-buster e no-store: o download() padrão podia vir do cache (CDN/Next)
  // e a Etapa salva só aparecia 10-20 s depois.
  try {
    const { data: u, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUrl(ARQ, 60);
    if (error || !u?.signedUrl) return {};
    const r = await fetch(`${u.signedUrl}&t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return {};
    return (await r.json()) as Record<string, EtapaProcesso>;
  } catch { return {}; }
}

export async function salvarEtapa(processoId: number, texto: string, por: string | null): Promise<EtapaProcesso | null> {
  const mapa = await lerEtapas();
  const t = texto.trim().slice(0, 200);
  if (!t) delete mapa[String(processoId)];
  else mapa[String(processoId)] = { texto: t, em: new Date().toISOString(), por };
  const { error } = await supabaseAdmin().storage.from(BUCKET).upload(
    ARQ, new Blob([JSON.stringify(mapa)], { type: "application/json" }), { upsert: true, contentType: "application/json", cacheControl: "0" });
  if (error) throw new Error(error.message);
  return mapa[String(processoId)] ?? null;
}

/** "05/11 - Aguardando pagamento" */
export function rotuloEtapa(e: EtapaProcesso | undefined | null): string {
  if (!e) return "";
  const d = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(new Date(e.em));
  return `${d} - ${e.texto}`;
}
