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
  /** Serviços linha a linha (só vem com ?detalhado=true). */
  servicos?: ServicoContratado[] | null;
  /** Calculado no app a partir de `servicos`. */
  mei?: ResumoMei;
  ajuste?: { saiu: number; entrou: number; destinos: number[]; origens: number[] };
}

export interface ConciliacaoResponse {
  total: number;
  dados: ConciliacaoItem[];
}

// ===========================================================================
// Serviços contratados linha a linha.
// Disponíveis em GET /fiscal/conciliacao-honorarios?detalhado=true
// (sem o parâmetro, a API devolve `servicos: null` e estas funções não atuam).
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
  /**
   * Conta contábil do serviço. É ela que define o bloco na conciliação
   * (2708 DP · 2707 Fiscal · 2706 Contábil · 2703 Manutenção · 2710 MEI).
   * Sem este campo não é possível redistribuir os blocos com exatidão.
   */
  conta?: number | null;
}

export type BlocoHonorario = "dp" | "fiscal" | "contabil" | "manutencao" | "mei" | "demais";

/**
 * Conta contábil -> bloco da conciliação (mesmo critério do agregado da API):
 * 2708=DP · 2707=Fiscal · 2706=Contábil · 2703=Manutenção · outras=demais.
 *
 * A conta 2710 NÃO entra aqui de propósito: MEI é definido pelo CÓDIGO do
 * serviço, porque os serviços 12 e 109 caem em 2710 e não são MEI.
 */
export const CONTA_BLOCO: Record<number, BlocoHonorario> = {
  2708: "dp",
  2707: "fiscal",
  2706: "contabil",
  2703: "manutencao",
};

/**
 * Códigos de serviço de MEI (levantados no cadastro `servicoescrit`).
 *
 * ATENÇÃO: não classificar MEI pela conta contábil (2710) — os serviços
 * 12 ("Taxas de Profissionais") e 109 ("Taxa Profissionais") caem nessa
 * conta e NÃO são MEI. A classificação é pelo código do serviço.
 */
export const SERVICOS_MEI_PRINCIPAIS = [72, 102, 79, 119];

export const SERVICOS_MEI_EVENTUAIS = [
  2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2010, 2013, 2015,
  2048, 2058, 2059, 2060, 2061, 2062, 2063, 2064, 2065, 2066, 2067,
];

export const SERVICOS_MEI = [...SERVICOS_MEI_PRINCIPAIS, ...SERVICOS_MEI_EVENTUAIS];

/** Serviços que caem na conta do MEI mas NÃO são MEI. */
const NAO_MEI = [12, 109];

/** true se o serviço é de MEI (por código; a descrição serve de reforço). */
export function ehServicoMei(s: { servico: number; descricao?: string | null }): boolean {
  if (NAO_MEI.includes(s.servico)) return false;
  if (SERVICOS_MEI.includes(s.servico)) return true;
  return /^\s*mei\b/i.test(s.descricao ?? "");
}

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
  const meis = servicos.filter(ehServicoMei);
  return {
    qtd: meis.length,
    valor: meis.reduce((t, s) => t + (s.valor || 0), 0),
  };
}

/**
 * Bloco em que o serviço entra.
 * Prioridade: MEI (por código/descrição) -> conta contábil -> demais.
 */
export function blocoDoServico(s: ServicoContratado): BlocoHonorario {
  if (ehServicoMei(s)) return "mei";
  if (s.conta && CONTA_BLOCO[s.conta]) return CONTA_BLOCO[s.conta];
  return "demais";
}

/** true se TODOS os serviços trazem a conta contábil (permite recálculo exato). */
export function temContas(servicos: ServicoContratado[]): boolean {
  return servicos.length > 0 && servicos.every((s) => typeof s.conta === "number" && s.conta > 0);
}

/**
 * Recalcula os blocos por empresa a partir dos serviços, já com a
 * reatribuição do [COD:nnn] aplicada. Só use quando `temContas()` for true.
 */
export function recalcularPorEmpresa(
  servicos: ServicoContratado[]
): Map<number, { financeiro: Financeiro; mei: ResumoMei }> {
  const mapa = new Map<number, { financeiro: Financeiro; mei: ResumoMei }>();

  for (const s of servicos) {
    const empresa = empresaDoServico(s);
    if (!mapa.has(empresa)) {
      mapa.set(empresa, {
        financeiro: { dp: 0, fiscal: 0, contabil: 0, manutencao: 0, outros: 0, total: 0 },
        mei: { qtd: 0, valor: 0 },
      });
    }
    const alvo = mapa.get(empresa)!;
    const v = s.valor || 0;
    const bloco = blocoDoServico(s);

    if (bloco === "mei") {
      alvo.mei.qtd += 1;
      alvo.mei.valor += v;
      alvo.financeiro.outros += v; // MEI também compõe "demais" no total
    } else if (bloco === "demais") {
      alvo.financeiro.outros += v;
    } else {
      alvo.financeiro[bloco] += v;
    }
    alvo.financeiro.total += v;
  }

  return mapa;
}

export interface AjusteEmpresa {
  /** Resumo de MEI já com a reatribuição aplicada. */
  mei: ResumoMei;
  /** Valor que saiu desta empresa para outras (marcado com [COD:]). */
  saiu: number;
  /** Valor que entrou nesta empresa vindo de outras. */
  entrou: number;
  /** Empresas de destino do que saiu. */
  destinos: number[];
  /** Empresas de origem do que entrou. */
  origens: number[];
}

/**
 * Reatribui os serviços à empresa correta (padrão [COD: nnn]) e devolve,
 * por empresa, o resumo de MEI e o que entrou/saiu na reatribuição.
 */
export function agruparServicosPorEmpresa(
  servicos: ServicoContratado[]
): Map<number, AjusteEmpresa> {
  const mapa = new Map<number, AjusteEmpresa & { lista: ServicoContratado[] }>();

  const garantir = (empresa: number) => {
    if (!mapa.has(empresa)) {
      mapa.set(empresa, { mei: { qtd: 0, valor: 0 }, saiu: 0, entrou: 0, destinos: [], origens: [], lista: [] });
    }
    return mapa.get(empresa)!;
  };

  for (const s of servicos) {
    const dono = empresaDoServico(s);
    const alvo = garantir(dono);
    alvo.lista.push(s);

    // serviço marcado: registra a movimentação nas duas pontas
    if (dono !== s.codigoempresa) {
      const v = s.valor || 0;
      const origem = garantir(s.codigoempresa);
      origem.saiu += v;
      if (!origem.destinos.includes(dono)) origem.destinos.push(dono);
      alvo.entrou += v;
      if (!alvo.origens.includes(s.codigoempresa)) alvo.origens.push(s.codigoempresa);
    }
  }

  const saida = new Map<number, AjusteEmpresa>();
  for (const [empresa, d] of mapa) {
    saida.set(empresa, {
      mei: resumirMei(d.lista),
      saiu: d.saiu,
      entrou: d.entrou,
      destinos: d.destinos,
      origens: d.origens,
    });
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
