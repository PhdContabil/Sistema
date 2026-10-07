// Informe de Rendimentos (Contábil) — regras de cálculo, SEM efeitos colaterais.
//
// Migrado do Access (`Contabil.accdb`, formulário `form_lancamento_rendimento`).
// Aqui só se monta O QUE será lançado no Questor Fiscal; quem grava é a API
// do Questor (ver docs/informe-rendimentos-api-questor.md). Manter este arquivo
// puro deixa as regras testáveis (lib/informe-rendimentos.test.ts) e permite o
// "dry run": a tela mostra exatamente as linhas antes de qualquer gravação.
//
// O regime vem do Tareffa (Características > 01.Regime Tributário), NÃO do
// TIPOENQUAD do Questor — esse campo é o enquadramento da Junta Comercial
// (Normal/EPP/ME/MEI) e não distingue Presumido de Real.

export type Regime = "presumido" | "real";

/** Lê a descrição do regime do Tareffa. Devolve null para o que não é suportado. */
export function regimeDeDescricao(desc: string | null | undefined): Regime | null {
  const t = (desc ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
  if (/\blucro presumido\b/.test(t)) return "presumido";
  if (/\blucro real\b/.test(t)) return "real";
  return null;
}

export const ROTULO_REGIME: Record<Regime, string> = {
  presumido: "Lucro Presumido",
  real: "Lucro Real",
};

// ------------------------------------------------------------------ entrada

export interface EntradaInforme {
  codigoempresa: number;
  /** YYYY-MM */
  competencia: string;
  /** Receitas financeiras (rendimentos de aplicação). */
  rendimento: number;
  demaisReceitas: number;
  dividendos: number;
  /** IRRF retido sobre os rendimentos. */
  retencao: number;
}

// ------------------------------------------------------------------- saída

/** Linha de OUTRAOPERACAOECF. O `seq` é calculado pela API, dentro da transação. */
export interface LancamentoEcf {
  codigoempresa: number;
  codigoestab: 1;
  tipoimposto: 3;
  codigooperacaofis: number;
  /** Primeiro dia da competência. */
  datalctofis: string;
  operacao: 1;
  valoroutraoperacaofis: number;
  rotulo: string;
}

/** Linha de EFDF100DEMAISDOC (F100 do EFD-Contribuições). `seq` pela API. */
export interface LancamentoF100 {
  codigoempresa: number;
  codigoestab: 1;
  indoper: 2;
  consideraproporc: 0;
  compensaretencao: 1;
  /** Último dia da competência. */
  datalctofis: string;
  valoroper: number;
  cst: number;
  aliqpis: number;
  basecalculo: number;
  aliqcofins: number;
  valorpis: number;
  valorcofins: number;
  cstcofins: number;
  tipodebitocofins: string;
  tipodebito: string;
  compensacred: 0 | 1;
  origemcredito: 0;
  contactb: number;
  origemdado: 2;
  detalhardimob: 0;
  rotulo: string;
}

export interface PlanoInforme {
  regime: Regime;
  codigoempresa: number;
  competencia: string;
  ecf: LancamentoEcf[];
  f100: LancamentoF100[];
  totais: { pis: number; cofins: number; base: number };
  avisos: string[];
}

// -------------------------------------------------- parâmetros por regime

/** Códigos de operação da ECF (OUTRAOPERACAOECF). */
export const OPERACAO_ECF = {
  rendimento: 45040,
  demaisReceitas: 45058,
  retencao: 45118,
} as const;

const DEBITO_NAO_TRIBUTAVEL = "4.3.15.999";
/** "Contribuição Não-Cumulativa Apurada a Alíquotas Diferenciadas". */
const DEBITO_NAO_CUMULATIVO = "4.3.05.02";

/** Contas contábeis EFD (CONTACTB). */
const CONTA = {
  /** Receitas — Presumido, como o Access gravava. */
  rendimentoPresumido: 2859,
  /** 4.1.05.001.002 Receitas Aplicações Mercado Aberto (tela do Questor, Lucro Real). */
  rendimentoReal: 2659,
  dividendos: 2893,
} as const;

/** Alíquotas do regime não cumulativo, em % (0,65 e 4,00), e em centésimos de ponto para o cálculo inteiro. */
const ALIQ_PIS = 0.65;
const ALIQ_COFINS = 4;

// ----------------------------------------------------------------- utilitários

const centavos = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;

/** Valor × alíquota (%), arredondado ao centavo — em inteiros, sem erro de ponto flutuante. */
export function tributo(base: number, aliquotaPct: number): number {
  const c = centavos(base);
  // aliquotaPct tem no máximo 2 casas: trabalhar em "pontos-base" (centésimos de %).
  return reais(Math.round((c * Math.round(aliquotaPct * 100)) / 10_000));
}

export function ultimoDiaDoMes(competencia: string): string {
  const [a, m] = competencia.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${competencia}-${String(d).padStart(2, "0")}`;
}

export function primeiroDiaDoMes(competencia: string): string {
  return `${competencia}-01`;
}

export class InformeInvalido extends Error {}

/** Valida a entrada e devolve valores normalizados (2 casas). Lança InformeInvalido em português. */
export function validarEntrada(e: EntradaInforme, hoje = new Date()): EntradaInforme {
  if (!Number.isInteger(e.codigoempresa) || e.codigoempresa < 1 || e.codigoempresa >= 9000) {
    throw new InformeInvalido("Empresa inválida.");
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.competencia)) {
    throw new InformeInvalido("Competência inválida (use AAAA-MM).");
  }
  const atual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  if (e.competencia > atual) throw new InformeInvalido("A competência não pode ser futura.");

  const campos: Array<[keyof EntradaInforme, string]> = [
    ["rendimento", "Rendimento"], ["demaisReceitas", "Demais receitas"],
    ["dividendos", "Dividendos"], ["retencao", "Retenção"],
  ];
  const out = { ...e };
  for (const [k, nome] of campos) {
    const v = Number(e[k] ?? 0);
    if (!Number.isFinite(v) || v < 0) throw new InformeInvalido(`${nome} inválido.`);
    (out as unknown as Record<string, number>)[k] = reais(centavos(v));
  }
  if (out.rendimento + out.demaisReceitas + out.dividendos + out.retencao <= 0) {
    throw new InformeInvalido("Informe ao menos um valor maior que zero.");
  }
  return out;
}

// ------------------------------------------------------------------- plano

/**
 * Monta os lançamentos. Mesma estrutura do Access, mudando só o F100 do
 * rendimento conforme o regime:
 *  - Presumido: CST 08 (sem incidência), alíquotas e valores zerados — a receita
 *    financeira não é tributada por PIS/COFINS nesse regime (cumulativo);
 *  - Real: CST 02, PIS 0,65% e COFINS 4,00%, débito 4.3.05.02, compensa
 *    crédito sobre a receita — como na tela do Questor.
 * Dividendos ficam sem incidência nos dois.
 */
export function montarPlano(entrada: EntradaInforme, regime: Regime): PlanoInforme {
  const e = validarEntrada(entrada);
  const dataEcf = primeiroDiaDoMes(e.competencia);
  const dataF100 = ultimoDiaDoMes(e.competencia);
  const avisos: string[] = [];

  const ecf: LancamentoEcf[] = [];
  const f100: LancamentoF100[] = [];
  const base = { codigoempresa: e.codigoempresa, codigoestab: 1 as const };

  const addEcf = (codigooperacaofis: number, valor: number, rotulo: string) =>
    ecf.push({ ...base, tipoimposto: 3, codigooperacaofis, datalctofis: dataEcf, operacao: 1, valoroutraoperacaofis: valor, rotulo });

  const f100Base = {
    ...base, indoper: 2 as const, consideraproporc: 0 as const, compensaretencao: 1 as const,
    datalctofis: dataF100, origemcredito: 0 as const, origemdado: 2 as const, detalhardimob: 0 as const,
  };

  let pis = 0, cofins = 0, baseTrib = 0;

  if (e.rendimento > 0) {
    addEcf(OPERACAO_ECF.rendimento, e.rendimento, "Rendimentos (ECF)");
    if (regime === "real") {
      const p = tributo(e.rendimento, ALIQ_PIS);
      const c = tributo(e.rendimento, ALIQ_COFINS);
      pis += p; cofins += c; baseTrib += e.rendimento;
      f100.push({
        ...f100Base, valoroper: e.rendimento, cst: 2, aliqpis: ALIQ_PIS, basecalculo: e.rendimento,
        aliqcofins: ALIQ_COFINS, valorpis: p, valorcofins: c, cstcofins: 2,
        tipodebitocofins: DEBITO_NAO_CUMULATIVO, tipodebito: DEBITO_NAO_CUMULATIVO,
        compensacred: 1, contactb: CONTA.rendimentoReal, rotulo: "Receita financeira (F100 tributável)",
      });
    } else {
      f100.push({
        ...f100Base, valoroper: e.rendimento, cst: 8, aliqpis: 0, basecalculo: e.rendimento,
        aliqcofins: 0, valorpis: 0, valorcofins: 0, cstcofins: 8,
        tipodebitocofins: DEBITO_NAO_TRIBUTAVEL, tipodebito: DEBITO_NAO_TRIBUTAVEL,
        compensacred: 0, contactb: CONTA.rendimentoPresumido, rotulo: "Receita financeira (F100 sem incidência)",
      });
    }
  }

  if (e.demaisReceitas > 0) {
    addEcf(OPERACAO_ECF.demaisReceitas, e.demaisReceitas, "Demais receitas (ECF)");
    if (regime === "real") {
      avisos.push("Demais receitas no Lucro Real: lança só a ECF, como no Presumido. Confirme se há incidência de PIS/COFINS sobre elas.");
    }
  }

  if (e.dividendos > 0) {
    f100.push({
      ...f100Base, valoroper: e.dividendos, cst: 8, aliqpis: 0, basecalculo: e.dividendos,
      aliqcofins: 0, valorpis: 0, valorcofins: 0, cstcofins: 8,
      tipodebitocofins: DEBITO_NAO_TRIBUTAVEL, tipodebito: DEBITO_NAO_TRIBUTAVEL,
      compensacred: 0, contactb: CONTA.dividendos, rotulo: "Dividendos (F100 sem incidência)",
    });
  }

  if (e.retencao > 0) addEcf(OPERACAO_ECF.retencao, e.retencao, "IRRF retido (ECF)");

  if (regime === "real") {
    avisos.push("Lucro Real: os códigos de operação da ECF (45040, 45058 e 45118) vieram do Presumido e ainda não foram confirmados para este regime.");
  }

  return {
    regime, codigoempresa: e.codigoempresa, competencia: e.competencia, ecf, f100,
    totais: { pis, cofins, base: baseTrib }, avisos,
  };
}
