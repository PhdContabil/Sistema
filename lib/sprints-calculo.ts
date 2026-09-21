// Sprint do TI — cálculo puro. Sem Supabase, sem React: dá para testar com
// `node --experimental-strip-types --test lib/sprints-calculo.test.ts`.
//
// A conta central é a mesma do TFS/Azure DevOps: a capacidade de uma pessoa na
// sprint é `horas por dia × dias úteis`, menos os dias em que ela estará fora.
// O que já foi planejado para ela consome esse total, e o que sobra é o tempo
// livre — o número que diz se cabe mais uma tarefa ou não.

/** Data "AAAA-MM-DD" → partes, sem passar por Date (que aplicaria fuso). */
function partes(iso: string): { a: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return null;
  return { a: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** Lista dos dias úteis (seg–sex) do período, em "AAAA-MM-DD". */
export function datasUteis(inicio: string, fim: string): string[] {
  const a = partes(inicio);
  const b = partes(fim);
  if (!a || !b) return [];

  const ini = Date.UTC(a.a, a.m - 1, a.d);
  const fin = Date.UTC(b.a, b.m - 1, b.d);
  if (fin < ini) return [];

  const dias: string[] = [];
  for (let t = ini; t <= fin; t += 86400000) {
    const d = new Date(t);
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6) dias.push(d.toISOString().slice(0, 10));
  }
  return dias;
}

/**
 * Dias úteis entre duas datas, inclusive nas pontas.
 *
 * Conta de segunda a sexta. Feriado não é decidido aqui: o time lança as datas
 * em `folgas`, o que é mais honesto do que embutir um calendário nacional que
 * alguém teria de manter — e cobre emenda, ponto facultativo e parada interna
 * com o mesmo mecanismo.
 */
export function diasUteis(inicio: string, fim: string): number {
  const a = partes(inicio);
  const b = partes(fim);
  if (!a || !b) return 0;

  // UTC de propósito: só interessa a diferença entre datas civis.
  const ini = Date.UTC(a.a, a.m - 1, a.d);
  const fin = Date.UTC(b.a, b.m - 1, b.d);
  if (fin < ini) return 0;

  let total = 0;
  for (let t = ini; t <= fin; t += 86400000) {
    const dia = new Date(t).getUTCDay(); // 0 domingo, 6 sábado
    if (dia !== 0 && dia !== 6) total += 1;
  }
  return total;
}

/** Soma dias corridos a uma data "AAAA-MM-DD". */
export function somarDias(iso: string, dias: number): string {
  const p = partes(iso);
  if (!p) return iso;
  const d = new Date(Date.UTC(p.a, p.m - 1, p.d + dias));
  return d.toISOString().slice(0, 10);
}

/** Capacidade de uma pessoa na sprint, em horas. Nunca negativa. */
export function capacidadePessoa(
  horasDia: number | null | undefined,
  diasTrabalhados: number
): number {
  const hd = Number(horasDia ?? 0);
  if (!Number.isFinite(hd) || hd <= 0) return 0;
  return Math.round(hd * Math.max(0, diasTrabalhados) * 100) / 100;
}

/** Folga lançada na sprint. `email` nulo = feriado, vale para todo mundo. */
export interface Folga {
  data: string;
  email?: string | null;
  motivo?: string | null;
}

/**
 * Dias que a pessoa realmente trabalha na sprint.
 *
 * Tira os feriados do time e as ausências dela. Uma folga pessoal no mesmo dia
 * de um feriado não desconta duas vezes — o dia já não existia.
 */
export function diasTrabalhados(
  inicio: string,
  fim: string,
  folgas: Folga[],
  email: string
): number {
  const uteis = new Set(datasUteis(inicio, fim));
  if (uteis.size === 0) return 0;
  const alvo = (email ?? "").toLowerCase();

  const fora = new Set<string>();
  for (const f of folgas ?? []) {
    const dono = (f.email ?? "").toLowerCase();
    if (dono && dono !== alvo) continue;
    if (uteis.has(f.data)) fora.add(f.data);
  }
  return uteis.size - fora.size;
}

export interface PessoaCapacidade {
  email: string;
  nome?: string | null;
  horas_dia: number;
}

export interface ItemPlanejado {
  ticket_id: string;
  responsavel_email: string | null;
  horas_planejadas: number | null;
}

export interface LinhaCapacidade {
  email: string;
  nome: string | null;
  horasDia: number;
  /** Dias úteis que sobraram para esta pessoa depois de feriados e ausências. */
  diasTrabalhados: number;
  /** Dias úteis perdidos: feriado do time + ausência dela. */
  diasFora: number;
  capacidade: number;
  planejado: number;
  livre: number;
  /** Quanto da capacidade já está comprometido, 0–100+ (passa de 100 se estourar). */
  ocupacao: number;
  estourou: boolean;
  itens: number;
}

/**
 * Distribuição da sprint por pessoa.
 *
 * Itens sem responsável ficam fora das linhas de pessoa e voltam em
 * `semResponsavel` — esconder essas horas dentro de um total geral faria a
 * sprint parecer mais folgada do que é.
 */
export function resumoCapacidade(
  pessoas: PessoaCapacidade[],
  itens: ItemPlanejado[],
  periodo: { inicio: string; fim: string; folgas?: Folga[] },
  nomePorEmail: Record<string, string | null> = {}
): {
  linhas: LinhaCapacidade[];
  capacidadeTotal: number;
  planejadoTotal: number;
  livreTotal: number;
  semResponsavel: { horas: number; itens: number };
  diasUteisSprint: number;
} {
  const folgas = periodo.folgas ?? [];
  const uteis = diasUteis(periodo.inicio, periodo.fim);
  const porPessoa = new Map<string, { horas: number; itens: number }>();
  let semRespHoras = 0;
  let semRespItens = 0;

  for (const it of itens) {
    const h = Number(it.horas_planejadas ?? 0);
    const horas = Number.isFinite(h) && h > 0 ? h : 0;
    const email = (it.responsavel_email ?? "").toLowerCase();
    if (!email) {
      semRespHoras += horas;
      semRespItens += 1;
      continue;
    }
    const acc = porPessoa.get(email) ?? { horas: 0, itens: 0 };
    acc.horas += horas;
    acc.itens += 1;
    porPessoa.set(email, acc);
  }

  const emails = new Set<string>(pessoas.map((p) => p.email.toLowerCase()));
  // Alguém pode ter item planejado sem linha de capacidade (entrou no time no
  // meio da sprint). Aparece com capacidade zero, estourado — que é a verdade.
  for (const e of porPessoa.keys()) emails.add(e);

  const config = new Map(pessoas.map((p) => [p.email.toLowerCase(), p]));

  const linhas: LinhaCapacidade[] = [...emails].map((email) => {
    const p = config.get(email);
    const horasDia = Number(p?.horas_dia ?? 0);
    const dias = diasTrabalhados(periodo.inicio, periodo.fim, folgas, email);
    const capacidade = capacidadePessoa(horasDia, dias);
    const acc = porPessoa.get(email) ?? { horas: 0, itens: 0 };
    const planejado = Math.round(acc.horas * 100) / 100;
    return {
      email,
      nome: p?.nome ?? nomePorEmail[email] ?? null,
      horasDia,
      diasTrabalhados: dias,
      diasFora: uteis - dias,
      capacidade,
      planejado,
      livre: Math.round((capacidade - planejado) * 100) / 100,
      ocupacao: capacidade > 0 ? Math.round((planejado / capacidade) * 1000) / 10 : planejado > 0 ? 100 : 0,
      estourou: planejado > capacidade,
      itens: acc.itens,
    };
  });

  linhas.sort((a, b) => (a.nome ?? a.email).localeCompare(b.nome ?? b.email, "pt-BR"));

  const capacidadeTotal = Math.round(linhas.reduce((s, l) => s + l.capacidade, 0) * 100) / 100;
  const planejadoTotal = Math.round(
    (linhas.reduce((s, l) => s + l.planejado, 0) + semRespHoras) * 100
  ) / 100;

  return {
    linhas,
    capacidadeTotal,
    planejadoTotal,
    livreTotal: Math.round((capacidadeTotal - planejadoTotal) * 100) / 100,
    semResponsavel: { horas: Math.round(semRespHoras * 100) / 100, itens: semRespItens },
    diasUteisSprint: uteis,
  };
}

/** Segundos → "2h 05min" / "45min" / "30s". Para o cronômetro. */
export function formatDuracao(segundos: number | null | undefined): string {
  const s = Math.max(0, Math.floor(Number(segundos ?? 0)));
  if (!Number.isFinite(s) || s === 0) return "0min";
  const h = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(min).padStart(2, "0")}min`;
  if (min > 0) return `${min}min`;
  return `${s}s`;
}

/** Segundos → horas decimais, que é como as horas ficam gravadas no ticket. */
export function segundosEmHoras(segundos: number | null | undefined): number {
  const s = Math.max(0, Number(segundos ?? 0));
  if (!Number.isFinite(s)) return 0;
  return Math.round((s / 3600) * 100) / 100;
}

/** Sugestão de fim para uma sprint de 15 dias corridos começando em `inicio`. */
export function fimPadrao(inicio: string): string {
  return somarDias(inicio, 14);
}

/**
 * Quanto falta de um item: o estimate menos o que já foi apontado.
 *
 * Nunca abaixo de zero — "faltam -3 h" não quer dizer nada. Quem passou do
 * previsto aparece por `estourou`, que é a informação útil.
 */
export function restante(
  estimate: number | null | undefined,
  horasApontadas: number
): { estimate: number; feito: number; falta: number; estourou: boolean; pct: number } {
  const est = Math.max(0, Number(estimate ?? 0) || 0);
  const feito = Math.max(0, Number(horasApontadas ?? 0) || 0);
  const falta = Math.max(0, Math.round((est - feito) * 100) / 100);
  return {
    estimate: est,
    feito: Math.round(feito * 100) / 100,
    falta,
    estourou: est > 0 && feito > est,
    pct: est > 0 ? Math.min(100, Math.round((feito / est) * 1000) / 10) : 0,
  };
}

/** Horas decimais → "8h 30m", como aparece no apontamento. */
export function horasEmTexto(horas: number | null | undefined): string {
  const h = Math.max(0, Number(horas ?? 0) || 0);
  const inteiras = Math.floor(h);
  const min = Math.round((h - inteiras) * 60);
  if (min === 60) return `${inteiras + 1}h 0m`;
  return `${inteiras}h ${min}m`;
}
