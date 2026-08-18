// Consolidação Departamental — regra F/R/I.
//
// Origem: medida `RegraGeral` do modelo Power BI "DEFIS".
// A API entrega os números crus (valor + quantidade por grupo); a decisão do
// que é pendência mora AQUI, para poder ser testada e versionada.
//
// Diferença deliberada em relação ao Power BI: lá a regra compara a soma com
// BLANK(), e em DAX `0 = BLANK()` é verdadeiro — uma empresa cujo movimento
// soma exatamente zero era tratada como "sem movimento" e a pendência ficava
// invisível (caso real: empresa 1194). Aqui usamos a QUANTIDADE de
// lançamentos, que responde "existe lançamento?" em vez de "a soma é
// diferente de zero?".

export interface MesConsolidacao {
  mes: number;
  folha_mov_valor: number;
  folha_mov_qtd: number;
  folha_ctb_valor: number;
  folha_ctb_qtd: number;
  receita_fis_valor: number;
  receita_fis_qtd: number;
  receita_ctb_valor: number;
  receita_ctb_qtd: number;
  imposto_ctb_valor: number;
  imposto_ctb_qtd: number;
}

export interface EmpresaConsolidacao {
  codigoempresa: number;
  nome: string | null;
  cnpj: string | null;
  regime?: string | null;
  encerrada_em?: string | null;
  meses: MesConsolidacao[];
}

export interface GruposContas {
  folha: number[];
  receita: number[];
  imposto: number[];
}

export interface ConsolidacaoResponse {
  ano: number;
  gerado_em?: string;
  grupos: GruposContas;
  total: number;
  dados: EmpresaConsolidacao[];
}

export interface SocioItem {
  codigoempresa: number;
  codigosocio: number;
  nomesocio: string | null;
  inscrfederal?: string | null;
  percentcotas?: number | null;
  datainiciosocio?: string | null;
  datafimsocio?: string | null;
}

/** Letras de pendência de um mês, na ordem F, R, I. */
export type Flag = "F" | "R" | "I";

export const FLAG_LABEL: Record<Flag, string> = {
  F: "Folha de Pagamento",
  R: "Receita",
  I: "Imposto",
};

export const MESES_ABR = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/**
 * Aplica a regra a um mês.
 *
 * F — houve folha no DP e nenhum lançamento contábil de folha.
 * R — houve nota de saída e nenhum lançamento contábil de receita.
 * I — houve nota de saída e nenhum lançamento contábil de imposto.
 */
export function flagsDoMes(m: MesConsolidacao): Flag[] {
  const temFolha = m.folha_mov_qtd > 0;
  const temSaida = m.receita_fis_qtd > 0;

  const f: Flag[] = [];
  if (temFolha && m.folha_ctb_qtd === 0) f.push("F");
  if (temSaida && m.receita_ctb_qtd === 0) f.push("R");
  if (temSaida && m.imposto_ctb_qtd === 0) f.push("I");
  return f;
}

export interface LinhaConsolidacao {
  codigoempresa: number;
  nome: string | null;
  cnpj: string | null;
  regime?: string | null;
  /** flags por mês, índice 0 = janeiro */
  meses: Flag[][];
  /** meses que têm algum movimento (para diferenciar "sem pendência" de "sem dado") */
  comDados: boolean[];
  totalPendencias: number;
}

export function montarLinhas(dados: EmpresaConsolidacao[]): LinhaConsolidacao[] {
  return dados.map((e) => {
    const meses: Flag[][] = Array.from({ length: 12 }, () => []);
    const comDados = Array.from({ length: 12 }, () => false);

    for (const m of e.meses) {
      const i = m.mes - 1;
      if (i < 0 || i > 11) continue;
      comDados[i] = true;
      meses[i] = flagsDoMes(m);
    }

    return {
      codigoempresa: e.codigoempresa,
      nome: e.nome,
      cnpj: e.cnpj,
      regime: e.regime ?? null,
      meses,
      comDados,
      totalPendencias: meses.reduce((s, f) => s + f.length, 0),
    };
  });
}

export interface TotaisConsolidacao {
  folhaContabil: number;
  receitaContabil: number;
  impostoContabil: number;
  receitaFiscal: number;
  folhaMovimento: number;
}

export function somarTotais(dados: EmpresaConsolidacao[]): TotaisConsolidacao {
  const t: TotaisConsolidacao = {
    folhaContabil: 0, receitaContabil: 0, impostoContabil: 0,
    receitaFiscal: 0, folhaMovimento: 0,
  };
  for (const e of dados) {
    for (const m of e.meses) {
      t.folhaContabil += m.folha_ctb_valor || 0;
      t.receitaContabil += m.receita_ctb_valor || 0;
      t.impostoContabil += m.imposto_ctb_valor || 0;
      t.receitaFiscal += m.receita_fis_valor || 0;
      t.folhaMovimento += m.folha_mov_valor || 0;
    }
  }
  return t;
}

export function contarPendencias(linhas: LinhaConsolidacao[]) {
  let F = 0, R = 0, I = 0, empresas = 0;
  for (const l of linhas) {
    if (l.totalPendencias > 0) empresas++;
    for (const mes of l.meses) {
      for (const f of mes) {
        if (f === "F") F++;
        else if (f === "R") R++;
        else I++;
      }
    }
  }
  return { F, R, I, empresas, total: F + R + I };
}

export function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatBRLCurto(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function formatCNPJ(c: string | null | undefined): string {
  if (!c) return "";
  const d = c.replace(/\D/g, "").padStart(14, "0");
  if (d.length !== 14) return c;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
