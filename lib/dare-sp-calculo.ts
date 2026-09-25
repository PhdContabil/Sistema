// DARE-SP — cálculo puro de multa, juros e receita. Sem rede, sem banco.
// node --experimental-strip-types --test lib/dare-sp-calculo.test.ts
//
// A Sefaz-SP NÃO calcula acréscimos na API de emissão: o `valorTotal` que ela
// devolve é só a soma do que mandamos. Quem erra aqui gera uma guia paga a
// menos, e o débito continua aberto — por isso este módulo é puro e testado.
//
// Base legal:
//   • multa  — RICMS-SP art. 528 / Lei 6.374/89 art. 87
//   • juros  — RICMS-SP art. 565, § 1º, com o termo inicial do Decreto
//              68.043/2023 (vigente desde 01/11/2023)

/** Data "AAAA-MM-DD" → partes. Sem `new Date(string)`, que aplicaria fuso. */
function partes(iso: string): { a: number; m: number; d: number } | null {
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!r) return null;
  const a = Number(r[1]), m = Number(r[2]), d = Number(r[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Rejeita 31/02 e afins: o Date normalizaria em silêncio.
  const t = new Date(Date.UTC(a, m - 1, d));
  if (t.getUTCFullYear() !== a || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return { a, m, d };
}

function utc(iso: string): number | null {
  const p = partes(iso);
  return p === null ? null : Date.UTC(p.a, p.m - 1, p.d);
}

/** Dias corridos entre duas datas. Negativo quando o pagamento é antecipado. */
export function diasDeAtraso(vencimento: string, pagamento: string): number {
  const v = utc(vencimento);
  const p = utc(pagamento);
  if (v === null || p === null) return 0;
  return Math.round((p - v) / 86400000);
}

// ------------------------------------------------------------------- multa

export interface FaixaMulta {
  ateDias: number | null;
  percentual: number;
  descricao: string;
}

/**
 * Faixas do art. 528. Não existe "0,33% ao dia" no ICMS-SP — isso é a regra
 * federal da Lei 9.430/96, e aplicá-la aqui daria multa errada.
 */
export const FAIXAS_MULTA: FaixaMulta[] = [
  { ateDias: 30, percentual: 2, descricao: "até 30 dias de atraso" },
  { ateDias: 60, percentual: 5, descricao: "de 31 a 60 dias de atraso" },
  { ateDias: null, percentual: 10, descricao: "acima de 60 dias de atraso" },
];

export interface Multa {
  percentual: number;
  valor: number;
  dias: number;
  descricao: string;
}

/**
 * Multa moratória sobre o imposto, contada a partir do vencimento.
 *
 * Pagamento em dia ou adiantado não tem multa. Débito inscrito em Dívida Ativa
 * (20%, cobrado pela PGE) fica fora: a tela não lista inscritos.
 */
export function calcularMulta(principal: number, vencimento: string, pagamento: string): Multa {
  const base = Math.max(0, Number(principal) || 0);
  const dias = diasDeAtraso(vencimento, pagamento);

  if (dias <= 0) {
    return { percentual: 0, valor: 0, dias: Math.max(0, dias), descricao: "sem atraso" };
  }

  const faixa = FAIXAS_MULTA.find((f) => f.ateDias === null || dias <= f.ateDias)!;
  return {
    percentual: faixa.percentual,
    valor: arredondar(base * (faixa.percentual / 100)),
    dias,
    descricao: faixa.descricao,
  };
}

// ------------------------------------------------------------------- juros

/** Selic acumulada de um mês fechado, em %. Chave "AAAA-MM". */
export type SelicMensal = Record<string, number>;

/**
 * Primeiro mês em que os juros correm.
 *
 * Decreto 68.043/2023: para vencimento a partir de nov/2023, os juros começam
 * no 1º dia do mês SEGUINTE ao vencimento, e o mês do vencimento não conta
 * fração. Antes disso corriam do dia seguinte ao vencimento, então o próprio
 * mês do vencimento já contava como fração de mês (+1%).
 */
export function regraDoTermoInicial(vencimento: string): "novo" | "antigo" {
  const p = partes(vencimento);
  if (!p) return "novo";
  return p.a > 2023 || (p.a === 2023 && p.m >= 11) ? "novo" : "antigo";
}

function chave(a: number, m: number): string {
  return `${a}-${String(m).padStart(2, "0")}`;
}

/** Último dia do mês. */
function ultimoDia(a: number, m: number): number {
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

export interface Juros {
  percentual: number;
  valor: number;
  /** Meses cheios usados, com a Selic de cada um. */
  meses: { competencia: string; taxa: number }[];
  /** true quando o mês do pagamento entrou como fração (+1%). */
  fracao: boolean;
  /** Meses cheios sem Selic publicada — sem eles não dá para fechar a conta. */
  faltando: string[];
  memoria: string;
}

/**
 * Juros de mora do art. 565: Selic acumulada de cada mês cheio mais 1% pela
 * fração de mês do pagamento.
 *
 * Devolve `faltando` em vez de chutar quando algum índice não saiu. Estimar
 * juros daria uma guia que a Sefaz recusa ou aceita a menos, e as duas coisas
 * voltam como problema para a contabilidade.
 */
export function calcularJuros(
  principal: number,
  vencimento: string,
  pagamento: string,
  selic: SelicMensal
): Juros {
  const base = Math.max(0, Number(principal) || 0);
  const v = partes(vencimento);
  const p = partes(pagamento);
  const vazio: Juros = {
    percentual: 0, valor: 0, meses: [], fracao: false, faltando: [],
    memoria: "sem atraso",
  };
  if (!v || !p) return vazio;
  if (diasDeAtraso(vencimento, pagamento) <= 0) return vazio;

  const regra = regraDoTermoInicial(vencimento);

  // Primeiro mês cheio a contar.
  let ano = v.a;
  let mes = v.m + 1;
  if (mes > 12) { mes = 1; ano += 1; }

  const meses: { competencia: string; taxa: number }[] = [];
  const faltando: string[] = [];

  // Meses cheios: do seguinte ao vencimento até o anterior ao pagamento.
  while (ano < p.a || (ano === p.a && mes < p.m)) {
    const k = chave(ano, mes);
    const taxa = selic?.[k];
    if (typeof taxa === "number" && Number.isFinite(taxa)) meses.push({ competencia: k, taxa });
    else faltando.push(k);
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
  }

  // Fração do mês do pagamento: sempre 1%, independente do dia.
  let pontos = meses.reduce((s, m2) => s + m2.taxa, 0) + 1;
  let fracao = true;

  // Regra antiga: o mês do vencimento também contava fração, salvo quando o
  // vencimento caía no último dia do mês — aí não havia dias restantes nele.
  let fracaoVencimento = false;
  if (regra === "antigo" && v.d < ultimoDia(v.a, v.m)) {
    pontos += 1;
    fracaoVencimento = true;
  }

  // Vencimento e pagamento no mesmo mês: não há mês cheio, só a fração.
  if (ano === p.a && mes === p.m && meses.length === 0 && faltando.length === 0) {
    fracao = true;
  }

  const percentual = Math.round(pontos * 10000) / 10000;
  const partesMemoria = [
    meses.length > 0
      ? `Selic de ${meses.map((m2) => `${m2.competencia} (${m2.taxa}%)`).join(" + ")}`
      : "nenhum mês cheio",
    "1% pela fração do mês do pagamento",
  ];
  if (fracaoVencimento) partesMemoria.push("1% pela fração do mês do vencimento (regra até out/2023)");

  return {
    percentual,
    valor: arredondar(base * (percentual / 100)),
    meses,
    fracao,
    faltando,
    memoria: partesMemoria.join(" + "),
  };
}

/**
 * Arredonda para cima no centavo.
 *
 * A Sefaz trunca; nós arredondamos. A diferença de um centavo é proposital:
 * pagar um centavo a mais fecha o débito, pagar um a menos deixa resíduo em
 * aberto — e resíduo vira novo débito com nova multa.
 */
export function arredondar(v: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const r = Math.ceil(n * 100 - 1e-9) / 100;
  // `Math.ceil(-1e-9)` devolve -0, que o formatador imprimiria como
  // "R$ -0,00" numa guia sem acréscimo nenhum.
  return r === 0 ? 0 : r;
}

// ------------------------------------------------------------------ receita

export type Regime = "simples" | "rpa";

export interface Receita {
  codigo: string;
  codigoServico: number;
  nome: string;
}

/**
 * Receita do DARE por código de imposto da Questor e regime da empresa.
 *
 * O código que vem da apuração diz o que é o débito; a Sefaz cobra por código
 * de serviço. Errar aqui não gera guia inválida — gera guia paga na conta
 * errada, que é bem pior de desfazer. Por isso a tela mostra a sugestão e
 * deixa trocar.
 */
export function receitaSugerida(codigoImposto: string, regime: Regime): Receita | null {
  const c = (codigoImposto ?? "").trim();

  if (c === "46-1") {
    return { codigo: "046-1", codigoServico: 4601, nome: "ICMS — operações próprias (RPA)" };
  }
  if (c === "46-2") {
    return regime === "simples"
      ? { codigo: "046-2", codigoServico: 4602, nome: "ICMS — diferencial de alíquota (Simples)" }
      : { codigo: "046-1", codigoServico: 4601, nome: "ICMS — operações próprias (RPA)" };
  }
  if (c === "146-2" || c === "146-3") {
    return regime === "simples"
      ? { codigo: "146-2", codigoServico: 14602, nome: "ICMS — substituição tributária (Simples)" }
      : { codigo: "146-1", codigoServico: 14601, nome: "ICMS — substituição tributária (RPA)" };
  }
  return null;
}

// ------------------------------------------------------------------- guia

export interface Guia {
  principal: number;
  multa: Multa;
  juros: Juros;
  total: number;
  /** Falta algum índice: a guia não pode ser emitida como está. */
  incompleta: boolean;
  /** Por que não dá para calcular, quando for o caso. */
  impedimento: string | null;
}

/** Data "AAAA-MM" de corte da Selic: antes disso a Sefaz usa UFESP. */
const PRIMEIRA_COMPETENCIA_SELIC = "2017-11";

/**
 * Monta a guia inteira. Também diz quando NÃO dá para calcular, em vez de
 * devolver um número que ninguém sabe se está certo.
 */
export function montarGuia(
  principal: number,
  vencimento: string,
  pagamento: string,
  selic: SelicMensal
): Guia {
  const base = Math.max(0, Number(principal) || 0);
  const v = partes(vencimento);

  const vazia = (impedimento: string | null): Guia => ({
    principal: base,
    multa: { percentual: 0, valor: 0, dias: 0, descricao: "—" },
    juros: { percentual: 0, valor: 0, meses: [], fracao: false, faltando: [], memoria: "—" },
    total: base,
    incompleta: impedimento !== null,
    impedimento,
  });

  if (!v) return vazia("Data de vencimento inválida.");
  if (!partes(pagamento)) return vazia("Data de pagamento inválida.");

  if (chave(v.a, v.m) < PRIMEIRA_COMPETENCIA_SELIC) {
    return vazia("Débito anterior a nov/2017: a Sefaz usa tabela de UFESP, não a Selic. Peça o valor à contabilidade.");
  }

  const multa = calcularMulta(base, vencimento, pagamento);
  const juros = calcularJuros(base, vencimento, pagamento, selic);

  if (juros.faltando.length > 0) {
    const g = vazia(
      `Selic ainda não publicada para ${juros.faltando.join(", ")}. Sem o índice não há como fechar a conta.`
    );
    return { ...g, multa, juros };
  }

  return {
    principal: base,
    multa,
    juros,
    total: arredondar(base + multa.valor + juros.valor),
    incompleta: false,
    impedimento: null,
  };
}

// ------------------------------------------------- competência e vencimento

/** "MM/AAAA" → { ano, mes }. */
export function lerCompetencia(competencia: string): { ano: number; mes: number } | null {
  const m = /^(\d{2})\/(\d{4})$/.exec((competencia ?? "").trim());
  if (!m) return null;
  const mes = Number(m[1]);
  const ano = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return { ano, mes };
}

/** "MM/AAAA" → "AAAA-MM", que ordena e compara direito. */
export function competenciaOrdenavel(competencia: string): string {
  const c = lerCompetencia(competencia);
  return c ? `${c.ano}-${String(c.mes).padStart(2, "0")}` : "";
}

/** Último dia do mês, como "AAAA-MM-DD". */
export function ultimoDiaDoMes(ano: number, mes: number): string {
  const d = new Date(Date.UTC(ano, mes, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Vencimento sugerido para o débito, a partir da competência.
 *
 * É uma SUGESTÃO, não a verdade: a Questor não devolve prazo de recolhimento,
 * e no RPA o prazo varia por código de recolhimento do CNAE. O padrão abaixo
 * cobre o caso mais comum do Simples (DIFAL e ST: último dia do segundo mês
 * seguinte) e serve de ponto de partida — a tela deixa corrigir, e o que for
 * corrigido fica marcado para a sincronização não desfazer.
 */
export function vencimentoSugerido(competencia: string, codigoImposto: string): string | null {
  const c = lerCompetencia(competencia);
  if (!c) return null;

  // Simples: DIFAL (46-2) e ST (146-2, 146-3) — último dia do 2º mês seguinte.
  // RPA (46-1) — sem prazo único; usamos o mesmo como ponto de partida.
  const meses = 2;
  let mes = c.mes + meses;
  let ano = c.ano;
  while (mes > 12) { mes -= 12; ano += 1; }
  return ultimoDiaDoMes(ano, mes);
}

/** Rótulo curto do código de imposto, para a tabela. */
export const NOME_IMPOSTO: Record<string, string> = {
  "46-1": "Regime periódico",
  "46-2": "DIFAL (Simples)",
  "146-2": "ST (Simples)",
  "146-3": "ST antecipado",
};
