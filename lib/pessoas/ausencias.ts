// Ausências (banco de horas e demais ausências) — pedido do colaborador e resposta do encarregado.
// Mesmo fluxo das férias (encarregado do setor aprova; Gestores veem tudo), guardado como JSON no
// bucket privado "cache-nucleo" do Supabase (sem tabela nova).
import { admin } from "./ferias";

export type StatusAusencia = "pendente" | "aprovada" | "rejeitada" | "cancelada";

export const TIPOS_AUSENCIA: Record<string, string> = {
  banco_horas: "Banco de horas (descanso)",
  consulta: "Consulta / exame médico",
  atraso: "Chegada mais tarde",
  saida: "Saída antecipada",
  falta: "Falta justificada",
  outro: "Outro",
};

export interface Ausencia {
  id: number;
  pessoa_id: number;
  nome: string;
  setor: string;
  solicitante: string;
  tipo: string;
  data: string; // AAAA-MM-DD (primeiro dia)
  data_fim: string; // AAAA-MM-DD (igual a data quando é um dia só)
  dia_inteiro: boolean;
  hora_inicio: string | null; // HH:MM
  hora_fim: string | null;
  motivo: string | null;
  status: StatusAusencia;
  aprovador: string | null;
  aprovador_nome: string | null;
  avaliado_em: string | null;
  resposta: string | null;
  criado_em: string;
}

const BUCKET = "cache-nucleo";
const ARQ = "pessoas-ausencias.json";

export async function lerAusencias(): Promise<Ausencia[]> {
  const sb = admin();
  if (!sb) return [];
  const { data, error } = await sb.storage.from(BUCKET).download(ARQ);
  if (error || !data) return [];
  try { return JSON.parse(await data.text()) as Ausencia[]; } catch { return []; }
}

export async function salvarAusencias(lista: Ausencia[]): Promise<string | null> {
  const sb = admin();
  if (!sb) return "Banco indisponível.";
  const { error } = await sb.storage.from(BUCKET)
    .upload(ARQ, new Blob([JSON.stringify(lista)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
  return error ? error.message : null;
}

export function dataBR(iso: string): string {
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** "05/11/2026, 14:00 às 18:00" ou "05/11/2026 a 07/11/2026 (dia inteiro)". */
export function quando(a: Pick<Ausencia, "data" | "data_fim" | "dia_inteiro" | "hora_inicio" | "hora_fim">): string {
  const dias = a.data_fim && a.data_fim !== a.data ? `${dataBR(a.data)} a ${dataBR(a.data_fim)}` : dataBR(a.data);
  if (a.dia_inteiro) return `${dias} (dia inteiro)`;
  return `${dias}, ${a.hora_inicio ?? "?"} às ${a.hora_fim ?? "?"}`;
}

export const ROTULO_STATUS: Record<StatusAusencia, string> = {
  pendente: "Aguardando o gestor",
  aprovada: "Confirmada",
  rejeitada: "Negada",
  cancelada: "Cancelada",
};

export const CLASSE_STATUS: Record<StatusAusencia, string> = {
  pendente: "sit-observar",
  aprovada: "sit-ok",
  rejeitada: "sit-critico",
  cancelada: "badge-soft",
};
