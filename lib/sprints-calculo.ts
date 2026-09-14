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

/**
 * Dias úteis entre duas datas, inclusive nas pontas.
 *
 * Conta de segunda a sexta. Feriados não entram aqui de propósito: quem sabe
 * quais dias a pessoa não estará é a própria equipe, e isso é lançado em
 * `dias_ausente` — que cobre feriado, férias e treinamento com um campo só,
 * em vez de exigir um calendário nacional sempre atualizado.
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
  diasUteisSprint: number,
  diasAusente: number | null | undefined = 0
): number {
  const hd = Number(horasDia ?? 0);
  const fora = Number(diasAusente ?? 0);
  if (!Number.isFinite(hd) || hd <= 0) return 0;
  const dias = Math.max(0, diasUteisSprint - (Number.isFinite(fora) ? fora : 0));
  return Math.round(hd * dias * 100) / 100;
}

export interface PessoaCapacidade {
  email: string;
  nome?: string | null;
  horas_dia: number;
  dias_ausente: number;
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
  diasAusente: number;
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
  diasUteisSprint: number,
  nomePorEmail: Record<string, string | null> = {}
): {
  linhas: LinhaCapacidade[];
  capacidadeTotal: number;
  planejadoTotal: number;
  livreTotal: number;
  semResponsavel: { horas: number; itens: number };
} {
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
    const diasAusente = Number(p?.dias_ausente ?? 0);
    const capacidade = capacidadePessoa(horasDia, diasUteisSprint, diasAusente);
    const acc = porPessoa.get(email) ?? { horas: 0, itens: 0 };
    const planejado = Math.round(acc.horas * 100) / 100;
    return {
      email,
      nome: p?.nome ?? nomePorEmail[email] ?? null,
      horasDia,
      diasAusente,
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
