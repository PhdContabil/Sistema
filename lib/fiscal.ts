// Tipos e helpers do módulo Fiscal.
// Fontes: GET /fiscal/analise-limite e GET /fiscal/dctfweb-obrigadas (API Questor).

export interface LimiteMensalItem {
  ano_mes: string;
  mes: number;
  faturamento: number | null;
  despesa: number | null;
  valor_considerado: number;
  acumulado: number;
  projetado: boolean;
}

export interface EmpresaLimite {
  codigoempresa: number;
  nome: string | null;
  cnpj: string | null;
  ano: number;
  faturamento_ano: number;
  meses_com_faturamento: number;
  ultimo_mes_com_faturamento: number | null;
  media_mensal: number;
  projecao_anual: number;
  percentual_sublimite: number;
  percentual_limite: number;
  estoura_sublimite: boolean;
  estoura_limite: boolean;
  mes_estouro_sublimite: string | null;
  mes_estouro_limite: string | null;
  mensal: LimiteMensalItem[];
}

export interface AnaliseLimiteResponse {
  ano: number;
  data_base: string;
  limite_geral: number;
  sublimite: number;
  total: number;
  dados: EmpresaLimite[];
}

export interface DctfwebObrigada {
  codigoempresa: number;
  cnpj: string | null;
  nome: string | null;
  ano: number;
  mes: number;
  total_folha: number | null;
  total_reinf: number | null;
  debito_apurado: number | null;
  origem: string | null;
  deve_entregar: boolean;
}

export interface DctfwebResponse {
  total: number;
  ano: number | null;
  mes: number | null;
  dados: DctfwebObrigada[];
}

export type Situacao = "OK" | "Observar" | "Atenção" | "Crítico";

// Semáforo por faixa: estouro do limite geral (4,8 mi) é crítico; do sublimite (3,6 mi) é atenção;
// projeção acima de 80% do limite (ou 90% do sublimite) merece observação.
export function situacaoLimite(e: EmpresaLimite): Situacao {
  if (e.estoura_limite) return "Crítico";
  if (e.estoura_sublimite) return "Atenção";
  if (e.percentual_limite >= 0.8 || e.percentual_sublimite >= 0.9) return "Observar";
  return "OK";
}

export function situacaoClass(s: Situacao): string {
  switch (s) {
    case "Crítico":
      return "sit-critico";
    case "Atenção":
      return "sit-atencao";
    case "Observar":
      return "sit-observar";
    default:
      return "sit-ok";
  }
}

export function ordemSituacao(s: Situacao): number {
  return { "Crítico": 0, "Atenção": 1, "Observar": 2, "OK": 3 }[s];
}

export function formatPct(v: number): string {
  return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export const MESES_ABREV = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];
