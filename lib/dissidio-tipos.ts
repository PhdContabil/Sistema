// Tipos compartilhados da Análise de Dissídio. Módulo puro — pode ser
// importado por servidor, cliente e testes sem arrastar dependência nenhuma.
//
// Espelha o contrato de GET /empresas/perfil?anos=2024,2025,2026.

// ---------------------------------------------------------- API Questor

export interface PerfilAtividade {
  codigo: string | null;
  descricao: string | null;
}

/** Métricas de um ano-calendário fechado (ou parcial, no ano corrente). */
export interface PerfilAno {
  ano: number;
  /** 12 em ano completo; no ano corrente, só os meses já fechados. */
  meses_considerados: number;
  empregados_media_mes: number | null;
  faturamento_media_mes: number | null;
  faturamento_total_ano: number | null;
  horas_media_mes: number | null;
  horas_total_ano: number | null;
  horas_apontamentos: number | null;
  /** Honorário vigente em 31/12 daquele ano (no ano corrente, hoje). */
  mensalidade_total: number | null;
  qtd_servicos: number | null;
}

export interface PerfilMensalidade {
  dp: number | null;
  fiscal: number | null;
  contabil: number | null;
  manutencao: number | null;
  demais: number | null;
  total: number | null;
  qtd_servicos: number | null;
}

export interface PerfilServico {
  servico: number;
  descricao: string | null;
  valor: number | null;
  conta: number | null;
  periodicidade: string | null;
  data_inicio: string | null;
  data_termino: string | null;
}

export interface PerfilEmpresa {
  codigoempresa: number;
  codigoestab: number | null;
  codigocliente: number | null;
  codigocliente_ativo?: boolean;
  codigomunic?: number | null;
  nome: string | null;
  cnpj: string | null;
  regime: string | null;
  atividade: PerfilAtividade | null;
  mensalidade: PerfilMensalidade;
  anos: PerfilAno[];
  servicos?: PerfilServico[] | null;
}

export interface PerfilResponse {
  meses?: number;
  periodo?: string | null;
  total: number;
  dados: PerfilEmpresa[];
}

// ---------------------------------------------------------- nosso banco

export interface Rodada {
  ano: number;
  percentual_geral: number;
  observacao: string | null;
  fechada: boolean;
  atualizada_em?: string;
  atualizada_por?: string | null;
}

/** Responsáveis pela validação do dissídio. Lista curta e estável. */
export const RESPONSAVEIS = [
  { id: "eduardo", nome: "Eduardo" },
  { id: "edcarlos", nome: "Ed Carlos" },
  { id: "junior", nome: "Júnior" },
] as const;

export const RESPONSAVEL_NOME: Record<string, string> =
  Object.fromEntries(RESPONSAVEIS.map((r) => [r.id, r.nome]));

/** Marcadores permanentes da empresa (não pertencem a uma rodada). */
export interface MarcadorEmpresa {
  codigoempresa: number;
  blacklist: boolean;
  blacklist_motivo: string | null;
  responsavel: string | null;
  atualizado_por: string | null;
  atualizado_em?: string;
}

export interface Ajuste {
  ano: number;
  codigoempresa: number;
  percentual: number | null;
  valor_novo: number | null;
  valor_base: number | null;
  origem: "percentual" | "valor";
  /** true = valor definido para esta empresa; false = derivado do percentual geral. */
  individual?: boolean;
  observacao: string | null;
  analisado_por: string | null;
  analisado_em: string;
}
