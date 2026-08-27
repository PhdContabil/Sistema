// Meio de transporte usado para chegar ao escritório.
// Módulo puro (sem Supabase) para poder ser importado tanto por componentes
// de cliente quanto de servidor sem arrastar credenciais para o navegador.

/** Guardamos o código no banco; o rótulo pode mudar sem migração. */
export const TRANSPORTES = [
  { id: "van", nome: "Van" },
  { id: "publico", nome: "Transporte público" },
  { id: "particular", nome: "Transporte particular" },
  { id: "nenhum", nome: "Nenhum" },
] as const;

export type TransporteId = (typeof TRANSPORTES)[number]["id"];

export const TRANSPORTE_NOME: Record<string, string> =
  Object.fromEntries(TRANSPORTES.map((t) => [t.id, t.nome]));
