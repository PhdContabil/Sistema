// Tipos e regras de negócio da conciliação de honorários x movimento dos setores.
// Fonte dos dados: GET /fiscal/conciliacao-honorarios (API Questor).

export interface Financeiro {
  dp: number;
  fiscal: number;
  contabil: number;
  manutencao: number;
  outros: number;
  total: number;
}

export interface Setores {
  empregados: number;
  prolabore: number;
  faturamento_mensal: number;
  lancamentos_media6m: number;
}

export interface ConciliacaoItem {
  codigoempresa: number;
  nome: string | null;
  cnpj: string | null;
  financeiro: Financeiro;
  setores: Setores;
}

export interface ConciliacaoResponse {
  total: number;
  dados: ConciliacaoItem[];
}

export type Resultado = "OK" | "Divergente" | "Sem contrato";

export interface LinhaConciliacao extends ConciliacaoItem {
  resultado: Resultado;
  consideracoes: string;
  motivos: string[];
}

// Regra sugerida pela doc: o setor "faz" o serviço quando o movimento é > 0.
export function avaliar(item: ConciliacaoItem): LinhaConciliacao {
  const f = item.financeiro;
  const s = item.setores;

  const pagaDp = f.dp > 0;
  const pagaFiscal = f.fiscal > 0;
  const pagaContabil = f.contabil > 0;
  const pagaManutencao = f.manutencao > 0;

  const fazDp = s.empregados > 0 || s.prolabore > 0;
  const fazFiscal = s.faturamento_mensal > 0;
  const fazContabil = s.lancamentos_media6m > 0;
  const temMovimento = fazDp || fazFiscal || fazContabil;

  const motivos: string[] = [];

  // DP / Folha (serviço 4)
  if (pagaDp && !fazDp) motivos.push("paga DP, sem folha/pró-labore");
  if (!pagaDp && fazDp) motivos.push("tem folha, sem honorário de DP");

  // Fiscal / Escrituração (serviço 5)
  if (pagaFiscal && !fazFiscal) motivos.push("paga fiscal, s/ faturamento");
  if (!pagaFiscal && fazFiscal) motivos.push("tem faturamento, sem honorário fiscal");

  // Contábil (serviço 3)
  if (pagaContabil && !fazContabil) motivos.push("paga contábil, mas não há lançamentos");
  if (!pagaContabil && fazContabil) motivos.push("não está pagando contábil");

  // Manutenção (serviço 22): taxa de empresa parada — não deveria ter movimento.
  if (pagaManutencao && temMovimento) motivos.push("manutenção, c/ movimento");

  // Sem contrato: não paga nenhum honorário e não tem movimento em nenhum setor
  // (ex.: empresa que só passou pelo escritório para um cancelamento).
  const semContrato = f.total <= 0 && !temMovimento;
  const resultado: Resultado = semContrato ? "Sem contrato" : motivos.length > 0 ? "Divergente" : "OK";

  return {
    ...item,
    resultado,
    consideracoes: semContrato ? "sem honorário e sem movimento" : motivos.join("; "),
    motivos,
  };
}

export function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatNum(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function formatCNPJ(cnpj: string | null): string {
  if (!cnpj) return "";
  const d = cnpj.replace(/\D/g, "").padStart(14, "0");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
