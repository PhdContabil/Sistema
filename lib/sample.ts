// Dados de exemplo (reproduzem o print original) usados quando a QUESTOR_API_KEY
// ainda não foi configurada, apenas para validar o visual.
import type { ConciliacaoItem } from "./conciliacao";

export const SAMPLE_DADOS: ConciliacaoItem[] = [
  {
    codigoempresa: 1,
    nome: "Empresa A",
    cnpj: null,
    financeiro: { dp: 100, fiscal: 200, contabil: 250, manutencao: 0, outros: 0, total: 550 },
    setores: { empregados: 2, prolabore: 1, faturamento_mensal: 150000, lancamentos_media6m: 350 },
  },
  {
    codigoempresa: 2,
    nome: "Empresa B",
    cnpj: null,
    financeiro: { dp: 100, fiscal: 200, contabil: 250, manutencao: 0, outros: 0, total: 550 },
    setores: { empregados: 2, prolabore: 1, faturamento_mensal: 150000, lancamentos_media6m: 0 },
  },
  {
    codigoempresa: 3,
    nome: "Empresa C",
    cnpj: null,
    financeiro: { dp: 100, fiscal: 200, contabil: 0, manutencao: 0, outros: 0, total: 300 },
    setores: { empregados: 2, prolabore: 1, faturamento_mensal: 150000, lancamentos_media6m: 200 },
  },
  {
    codigoempresa: 4,
    nome: "Empresa D",
    cnpj: null,
    financeiro: { dp: 100, fiscal: 200, contabil: 0, manutencao: 0, outros: 0, total: 300 },
    setores: { empregados: 2, prolabore: 1, faturamento_mensal: 0, lancamentos_media6m: 0 },
  },
  {
    codigoempresa: 5,
    nome: "Empresa E",
    cnpj: null,
    financeiro: { dp: 0, fiscal: 0, contabil: 0, manutencao: 200, outros: 0, total: 200 },
    setores: { empregados: 0, prolabore: 0, faturamento_mensal: 0, lancamentos_media6m: 0 },
  },
  {
    codigoempresa: 6,
    nome: "Empresa F",
    cnpj: null,
    financeiro: { dp: 0, fiscal: 0, contabil: 0, manutencao: 200, outros: 0, total: 200 },
    setores: { empregados: 2, prolabore: 1, faturamento_mensal: 70000, lancamentos_media6m: 0 },
  },
];
