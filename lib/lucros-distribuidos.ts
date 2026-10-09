// Lucros Distribuídos (Contábil) — regras de cálculo, SEM efeitos colaterais.
//
// Migrado do Access (`Contabil.accdb`): form_lancamento_lucros_distribuidos,
// form_ajuste_lucros_distribuidos e form_log_lucros_distribuidos. Aqui só se
// monta O QUE será gravado no Questor; quem grava é a API do Questor (ver
// docs/lucros-distribuidos-api-questor.md). Sem regime tributário: o Access não
// consultava regime para lucros, valia para qualquer empresa.
//
// Diferença proposital em relação ao Access: o campo "Observação"
// (DESCCOMPLEMENTAR) foi removido e não é mais enviado.

/** Distribuição acima deste valor, a partir de 2026, sofre IRRF (Lei 15.270/2025). */
export const LIMITE_IRRF = 50000;
export const ALIQUOTA_IRRF = 10;
export const ANO_INICIO_IRRF = 2026;

/** Tipos de isenção oferecidos na tela (TIPOISENCAO). Só 1 e 12 têm regra de cálculo. */
export const ISENCOES: Array<{ codigo: number; rotulo: string }> = [
  { codigo: 1, rotulo: "Não se aplica" },
  { codigo: 12, rotulo: "Isento (código 12)" },
];
export const ISENCAO_TOTAL = 12;

export class LucroInvalido extends Error {}

export interface EntradaLucro {
  codigoempresa: number;
  codigosocio: number;
  /** AAAA-MM */
  competencia: string;
  /** AAAA-MM-DD */
  dataPagamento: string;
  rendimento: number;
  baseIrrf: number;
  imposto: number;
  tisencao: number;
}

export const centavos = (n: number) => Math.round((n + Number.EPSILON) * 100);
export const dosCentavos = (c: number) => c / 100;

export function ehCompetencia(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function ehData(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Último dia do mês de uma data AAAA-MM-DD (ou AAAA-MM), em AAAA-MM-DD. */
export function ultimoDiaDoMes(v: string): string {
  const [a, m] = v.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Sugestão de IRRF, igual ao formulário de ajuste do Access (o mais completo):
 * competência anterior a 2026 não retém; de 2026 em diante, 10% sobre o total
 * quando a distribuição passa de R$ 50.000,00. Sempre editável na tela.
 */
export function sugerirIrrf(rendimento: number, competencia: string): { base: number; imposto: number } {
  const ano = Number(competencia.slice(0, 4));
  if (!(rendimento > LIMITE_IRRF) || !(ano >= ANO_INICIO_IRRF)) return { base: 0, imposto: 0 };
  return { base: rendimento, imposto: dosCentavos(Math.round((centavos(rendimento) * ALIQUOTA_IRRF) / 100)) };
}

export function validarEntrada(e: EntradaLucro): EntradaLucro {
  if (!Number.isInteger(e.codigoempresa) || e.codigoempresa <= 0) throw new LucroInvalido("Escolha a empresa.");
  if (!Number.isInteger(e.codigosocio) || e.codigosocio <= 0) throw new LucroInvalido("Escolha o sócio.");
  if (!ehCompetencia(e.competencia)) throw new LucroInvalido("Competência inválida (use AAAA-MM).");
  if (!ehData(e.dataPagamento)) throw new LucroInvalido("Data do pagamento inválida.");
  for (const [rotulo, v] of [["Rendimento", e.rendimento], ["Base IRRF", e.baseIrrf], ["Imposto retido", e.imposto]] as const) {
    if (!Number.isFinite(v) || v < 0) throw new LucroInvalido(`${rotulo} inválido.`);
  }
  if (centavos(e.rendimento) <= 0) throw new LucroInvalido("Informe o rendimento (valor maior que zero).");
  if (centavos(e.imposto) > centavos(e.rendimento)) throw new LucroInvalido("O imposto retido não pode ser maior que o rendimento.");
  if (e.imposto > 0 && e.baseIrrf <= 0) throw new LucroInvalido("Com imposto retido, informe a base do IRRF.");
  // Aceita qualquer código do Questor (um lançamento antigo pode ter outro tipo de isenção).
  if (!Number.isInteger(e.tisencao) || e.tisencao < 1 || e.tisencao > 99) throw new LucroInvalido("Tipo de isenção inválido.");
  return e;
}

/** Linha de OUTRORENDIMENTOPAGO (fiscal). `seq`/CODIGOOUTRORENDIMENTOPAGO é da API. */
export interface LinhaFiscalLucro {
  codigoempresa: number;
  codigoestab: number;
  codigosocio: number;
  codigonaturezarendimento: number;
  competencia: string;
  datalctofis: string;
  valorrendpago: number;
  basecalcirrf: number;
  aliquota: number | null;
  valorimposto: number | null;
  codigoimposto: number | null;
  variacaoimposto: number | null;
  tipoisencao: number;
  valorisencao: number;
}

/** Linha de INFORMERENDIMENTOOUTREND (DP). `seq` e `campoinforme` (TIPOENQUAD) são da API. */
export interface LinhaDpLucro {
  codigoempresa: number;
  tipo: number;
  codigoestab: number;
  codigosocio: number;
  descricaorendimento: string;
  datapgto: string;
  valorrendimento: number;
  valorirrf: number;
  codigoimposto: number;
  variacaoimposto: number;
}

export interface PlanoLucro {
  entrada: EntradaLucro;
  fiscal: LinhaFiscalLucro;
  dp: LinhaDpLucro;
  liquido: number;
}

function linhaFiscal(e: EntradaLucro): LinhaFiscalLucro {
  const comImposto = centavos(e.imposto) > 0;
  return {
    codigoempresa: e.codigoempresa,
    codigoestab: 1,
    codigosocio: e.codigosocio,
    codigonaturezarendimento: 12001,
    competencia: `${e.competencia}-01`,
    datalctofis: ultimoDiaDoMes(e.dataPagamento),
    valorrendpago: e.rendimento,
    basecalcirrf: comImposto ? e.baseIrrf : 0,
    aliquota: comImposto ? ALIQUOTA_IRRF : null,
    valorimposto: comImposto ? e.imposto : null,
    codigoimposto: comImposto ? 1841 : null,
    variacaoimposto: comImposto ? 1 : null,
    tipoisencao: e.tisencao,
    valorisencao: e.tisencao === ISENCAO_TOTAL ? e.rendimento : 0,
  };
}

function linhaDp(e: EntradaLucro): LinhaDpLucro {
  return {
    codigoempresa: e.codigoempresa,
    tipo: 2,
    codigoestab: 1,
    codigosocio: e.codigosocio,
    descricaorendimento: `Distribuição de lucros de ${e.competencia.slice(0, 4)}`,
    datapgto: ultimoDiaDoMes(e.dataPagamento),
    valorrendimento: e.rendimento,
    valorirrf: 0,
    codigoimposto: 561,
    variacaoimposto: 2,
  };
}

export function montarPlano(entrada: EntradaLucro): PlanoLucro {
  const e = validarEntrada(entrada);
  return {
    entrada: e,
    fiscal: linhaFiscal(e),
    dp: linhaDp(e),
    liquido: dosCentavos(centavos(e.rendimento) - centavos(e.imposto)),
  };
}

// ------------------------------------------------------------------- ajuste

export interface EntradaAjuste extends EntradaLucro {
  /** CODIGOOUTRORENDIMENTOPAGO do lançamento que será alterado. */
  chave: number;
  /** DATALCTOFIS atual do lançamento (a API acha a linha da DP por ela). */
  dataAtual: string;
}

export interface PlanoAjuste {
  entrada: EntradaAjuste;
  /** Valores novos de OUTRORENDIMENTOPAGO. */
  fiscal: LinhaFiscalLucro;
  /** Valores novos de INFORMERENDIMENTOOUTREND. */
  dp: Pick<LinhaDpLucro, "datapgto" | "valorrendimento">;
  liquido: number;
}

export function montarAjuste(entrada: EntradaAjuste): PlanoAjuste {
  if (!Number.isInteger(entrada.chave) || entrada.chave <= 0) throw new LucroInvalido("Lançamento a alterar não informado.");
  if (!ehData(entrada.dataAtual)) throw new LucroInvalido("Data atual do lançamento inválida.");
  const e = validarEntrada(entrada) as EntradaAjuste;
  const dp = linhaDp(e);
  return {
    entrada: e,
    fiscal: linhaFiscal(e),
    dp: { datapgto: dp.datapgto, valorrendimento: dp.valorrendimento },
    liquido: dosCentavos(centavos(e.rendimento) - centavos(e.imposto)),
  };
}
