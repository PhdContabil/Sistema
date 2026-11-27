// Cor e rótulo de cada tipo de evento da agenda (eventos_agenda.tipo).
// Compartilhado entre a linha do tempo (client) e o calendário do mês (server).
export const CORES_TIPO: Record<string, { cor: string; rotulo: string }> = {
  ferias:           { cor: "#16a34a", rotulo: "Férias" },
  ausencia:         { cor: "#f59e0b", rotulo: "Ausência" },
  licenca:          { cor: "#eab308", rotulo: "Licença B.H." },
  feriado:          { cor: "#dc2626", rotulo: "Feriado" },
  emenda:           { cor: "#0ea5e9", rotulo: "Emenda" },
  reuniao:          { cor: "#0f766e", rotulo: "Reunião" },
  aniversario:      { cor: "#8b5cf6", rotulo: "Aniversário" },
  confraternizacao: { cor: "#ec4899", rotulo: "Confraternização" },
  bem_estar:        { cor: "#d6336c", rotulo: "Bem-Estar" },
  outro:            { cor: "#64748b", rotulo: "Outro" },
};

/** Sigla da marca na Agenda semanal (a legenda fica em AGENDA_LEGENDA). */
export function siglaDoEvento(tipo: string, detalhe: string | null): string {
  if (tipo === "aniversario") return detalhe === "Tempo de casa" ? "T" : "A";
  if (tipo === "confraternizacao") return "C";
  if (tipo === "emenda") return "E";
  if (tipo === "ferias") return "F";
  if (tipo === "licenca") return "L";
  if (tipo === "reuniao") return "R";
  if (tipo === "bem_estar") return "B";
  return "D";
}
