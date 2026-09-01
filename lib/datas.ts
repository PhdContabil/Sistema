// Formatação de data/hora com fuso FIXO de São Paulo.
//
// Motivo: `toLocaleString("pt-BR")` sem fuso usa o relógio de quem renderiza.
// Em server component isso é o servidor da Vercel, que roda em UTC — e a tela
// mostrava 3 horas à frente. Fixar o fuso faz servidor e navegador exibirem
// o mesmo horário, que é o do escritório.

const FUSO = "America/Sao_Paulo";

export function formatDataHora(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: FUSO,
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function formatData(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric",
  });
}

/** Agora, no fuso do escritório — para carimbar exportações. */
export function agoraFormatado(): string {
  return formatDataHora(new Date());
}
