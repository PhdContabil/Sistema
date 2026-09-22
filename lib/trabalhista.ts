// Tipos do módulo Trabalhista.
// Fonte: GET /rh/funcionarios-ativos (API Questor) — sem dados de salário,
// usado apenas como sugestão de nome/empresa na Folha de Pagamento.

export interface FuncionarioAtivo {
  codigoempresa: number;
  codigofunccontr: number;
  nomefunc: string;
  dataadm: string | null;
  codigocargo: number | null;
  codigofuncao: number | null;
}

export interface FuncionariosAtivosResponse {
  total: number;
  dados: FuncionarioAtivo[];
}

/** Forma já resolvida (nome do funcionário + nome da empresa) para preencher os datalists. */
export interface SugestaoFuncionario {
  nome: string;
  empresa: string | null;
}
