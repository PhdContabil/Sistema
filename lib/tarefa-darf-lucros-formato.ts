// Tarefa avulsa "Guia DARF Lucros ou Dividendos IRRF 1841" no Tareffa — parte pura (sem rede).
// Regras do departamento: competência da tarefa = competência do lançamento (ex.: 10/2026),
// vencimento = dia 15 do mês seguinte (15/11/2026), responsável = responsável do
// "Departamento Fiscal" cadastrado na empresa, dentro do próprio Tareffa.

export const DIA_VENCIMENTO_DARF = 15;

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

/** "AAAA-MM" -> "MM/AAAA" (formato do campo Competência do Tareffa). */
export function competenciaTareffa(competencia: string): string {
  const [a, m] = competencia.split("-");
  return `${m}/${a}`;
}

/** Dia 15 do mês seguinte à competência: "2026-10" -> "2026-11-15"; "2026-12" -> "2027-01-15". */
export function vencimentoDarf(competencia: string): string {
  let [a, m] = competencia.split("-").map(Number);
  m += 1;
  if (m > 12) { m = 1; a += 1; }
  return `${a}-${String(m).padStart(2, "0")}-${String(DIA_VENCIMENTO_DARF).padStart(2, "0")}`;
}

export interface RegistroResponsavel {
  grupoServico?: { id?: number; descricao?: string } | null;
  responsavel?: { id?: number; nome?: string } | null;
}

/** Responsável do Departamento Fiscal entre os responsáveis da empresa (GET .../links/equipes/responsaveis). */
export function escolherResponsavelFiscal(records: RegistroResponsavel[]): { id: number; nome: string } | null {
  const fiscal = records.find((r) => {
    const d = sem(r.grupoServico?.descricao ?? "");
    return d === "DEPARTAMENTO FISCAL" || d === "FISCAL";
  });
  const id = fiscal?.responsavel?.id;
  const nome = fiscal?.responsavel?.nome;
  return typeof id === "number" && nome ? { id, nome } : null;
}

/** Serviço "Guia DARF Lucros ou Dividendos IRRF 1841" entre os serviços do Tareffa. */
export function escolherServicoDarf(servicos: Array<{ id: number; nome: string }>): { id: number; nome: string } | null {
  const achados = servicos.filter((s) => {
    const n = sem(s.nome);
    return n.includes("DARF") && n.includes("1841") && n.includes("LUCROS");
  });
  return achados.length === 1 ? achados[0] : null;
}

export interface DadosTarefaDarf {
  servicoId: number;
  clienteId: number;
  usuarioId: number;
  competencia: string; // AAAA-MM
  observacoes: string;
  referencia: string;
}

/** Corpo do POST /services/servicos_programados/avulso, igual ao que a tela do Tareffa envia. */
export function montarCorpoAvulso(d: DadosTarefaDarf) {
  return {
    servico: { id: d.servicoId },
    cliente: { id: d.clienteId },
    alocadoPara: { id: d.usuarioId },
    dataVencimento: `${vencimentoDarf(d.competencia)}T03:00:00.000Z`,
    observacoes: d.observacoes,
    referencia: d.referencia,
    tipoGeracao: 2,
    retificacao: false,
    competencia: competenciaTareffa(d.competencia),
    nrOcorrencias: 1,
    tempoUnitario: 0,
    valorUnitario: 0,
  };
}
