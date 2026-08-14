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

// ===========================================================================
// Serviços contratados linha a linha (depende de a API expor `servicos[]`).
// Enquanto o endpoint devolver só os totais agregados, estas funções ficam
// inativas — mas já estão prontas e testadas.
// ===========================================================================

export interface ServicoContratado {
  /** Empresa em que o serviço está lançado no Questor. */
  codigoempresa: number;
  /** Código do serviço (ex.: 4 = Folha, 5 = Fiscal, 3 = Contábil, 22 = Manutenção). */
  servico: number;
  descricao?: string | null;
  valor: number;
  /** Campo "Observação" do contrato — onde vem o padrão [COD: 548]. */
  observacao?: string | null;
  complemento?: string | null;
}

/** Códigos de serviço considerados MEI (ajuste conforme o cadastro do Questor). */
export const SERVICOS_MEI = [70, 71, 72];

/**
 * Extrai o código da empresa correta do campo de observação.
 *
 * Aceita variações de digitação:
 *   "[COD: 548]"  "[COD:548]"  "[cod : 548]"  "[Cod:548]"
 * e ignora qualquer outro texto antes ou depois.
 *
 * Retorna null quando não há o padrão.
 */
export function extrairCodigoEmpresa(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const m = /\[\s*cod\s*:?\s*(\d+)\s*\]/i.exec(texto);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Empresa à qual o serviço realmente pertence: se a observação tiver
 * [COD: nnn], vale nnn; senão, a empresa em que ele está lançado.
 */
export function empresaDoServico(s: ServicoContratado): number {
  return (
    extrairCodigoEmpresa(s.observacao) ??
    extrairCodigoEmpresa(s.complemento) ??
    s.codigoempresa
  );
}

export interface ResumoMei { qtd: number; valor: number }

/** Soma quantidade e valor dos serviços de MEI de uma lista. */
export function resumirMei(servicos: ServicoContratado[]): ResumoMei {
  const meis = servicos.filter((s) => SERVICOS_MEI.includes(s.servico));
  return {
    qtd: meis.length,
    valor: meis.reduce((t, s) => t + (s.valor || 0), 0),
  };
}

/**
 * Reatribui os serviços à empresa correta (padrão [COD: nnn]) e devolve,
 * por empresa, os totais por bloco + o resumo de MEI.
 */
export function agruparServicosPorEmpresa(
  servicos: ServicoContratado[]
): Map<number, { financeiro: Financeiro; mei: ResumoMei }> {
  const mapa = new Map<number, { financeiro: Financeiro; mei: ResumoMei; lista: ServicoContratado[] }>();

  for (const s of servicos) {
    const empresa = empresaDoServico(s);
    if (!mapa.has(empresa)) {
      mapa.set(empresa, {
        financeiro: { dp: 0, fiscal: 0, contabil: 0, manutencao: 0, outros: 0, total: 0 },
        mei: { qtd: 0, valor: 0 },
        lista: [],
      });
    }
    const alvo = mapa.get(empresa)!;
    alvo.lista.push(s);

    const v = s.valor || 0;
    if (s.servico === 4) alvo.financeiro.dp += v;
    else if (s.servico === 5) alvo.financeiro.fiscal += v;
    else if (s.servico === 3) alvo.financeiro.contabil += v;
    else if (s.servico === 22) alvo.financeiro.manutencao += v;
    else alvo.financeiro.outros += v;
    alvo.financeiro.total += v;
  }

  const saida = new Map<number, { financeiro: Financeiro; mei: ResumoMei }>();
  for (const [empresa, dados] of mapa) {
    saida.set(empresa, { financeiro: dados.financeiro, mei: resumirMei(dados.lista) });
  }
  return saida;
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
