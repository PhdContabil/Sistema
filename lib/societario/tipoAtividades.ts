// Atividades-modelo de cada tipo de processo (como no Tareffa: Processo -> Atividades / Prazos).
// Ao abrir um processo novo e escolher o tipo, o formulário já vem com essas atividades.
// Guardado como JSON no bucket privado "cache-nucleo" do Supabase (sem tabela nova).

import { supabaseAdmin } from "./supabase";
import { loadAll } from "./dataSource";

export interface ModeloAtividade {
  nome: string;
  responsavel: string; // "" = definir no processo
  coresponsavel?: string;
  dias: number; // prazo em dias úteis, contado a partir da atividade anterior (a 1ª conta da data de início)
  obs?: string; // observação opcional (só orientação)
  /** Serviço do Tareffa criado para a empresa quando o processo é aberto (como no Tareffa Societário). */
  servicoTareffa?: { id: number; nome: string };
  /** Quem recebe o serviço no Tareffa (nome do usuário do Tareffa). Vazio = responsável da atividade. */
  responsavelTareffa?: string;
}

const BUCKET = "cache-nucleo";
const ARQ = "societario-tipos-atividades.json";

type Mapa = Record<string, ModeloAtividade[]>; // chave = id do tipo

async function lerMapa(): Promise<Mapa> {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(ARQ);
  if (error || !data) return {};
  try {
    const j = JSON.parse(await data.text());
    return j && typeof j === "object" ? (j as Mapa) : {};
  } catch {
    return {};
  }
}

export async function listarModelos(): Promise<Mapa> {
  return lerMapa();
}

export async function salvarModelo(tipoId: string, itens: ModeloAtividade[]): Promise<void> {
  const mapa = await lerMapa();
  mapa[tipoId] = itens
    .map((a) => ({
      nome: String(a.nome || "").trim().slice(0, 200),
      responsavel: String(a.responsavel || "").trim(),
      coresponsavel: String(a.coresponsavel || "").trim() || undefined,
      dias: Math.max(0, Math.min(999, Math.round(Number(a.dias) || 0))),
      obs: String(a.obs || "").trim().slice(0, 500) || undefined,
      servicoTareffa: a.servicoTareffa && Number(a.servicoTareffa.id) ? { id: Number(a.servicoTareffa.id), nome: String(a.servicoTareffa.nome || "") } : undefined,
      responsavelTareffa: (a.servicoTareffa && String(a.responsavelTareffa || "").trim().slice(0, 120)) || undefined,
    }))
    .filter((a) => a.nome);
  const { error } = await supabaseAdmin()
    .storage.from(BUCKET)
    .upload(ARQ, new Blob([JSON.stringify(mapa)], { type: "application/json" }), {
      upsert: true,
      contentType: "application/json",
    });
  if (error) throw new Error(`Salvar atividades do tipo: ${error.message}`);
}

/**
 * Sugestão a partir dos processos que já existem (os sincronizados do Tareffa):
 * pega o processo desse tipo com mais atividades e copia a sequência.
 */
export async function sugerirDoTareffa(nomeTipo: string): Promise<ModeloAtividade[]> {
  const snap = await loadAll();
  const alvo = nomeTipo.trim().toLowerCase();
  const candidatos = snap.processos
    .filter((p) => String(p.process || "").trim().toLowerCase() === alvo && (p.activities?.length ?? 0) > 0)
    .sort((a, b) => b.activities.length - a.activities.length);
  const p = candidatos[0];
  if (!p) return [];
  return [...p.activities]
    .sort((a, b) => String(a.order || "").localeCompare(String(b.order || ""), "pt-BR", { numeric: true }))
    .map((a) => ({ nome: a.name, responsavel: "", dias: 0 }));
}
