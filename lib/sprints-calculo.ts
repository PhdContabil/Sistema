// Sprint do TI — cálculo puro. Sem Supabase, sem React: dá para testar com
// `node --experimental-strip-types --test lib/sprints-calculo.test.ts`.
//
// A conta central é a mesma do TFS/Azure DevOps: a capacidade de uma pessoa na
// sprint é `horas por dia × dias úteis`, menos os dias em que ela estará fora.
// As horas gastas entram por apontamento manual, uma vez ao fim do dia.
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
  /** Horas separadas para incidentes nesta sprint. Saem da mesma capacidade. */
  horas_incidente?: number;
}

export interface ItemPlanejado {
  ticket_id: string;
  responsavel_email: string | null;
  horas_planejadas: number | null;
  /** Cartão marcado como incidente pelo TI — consome a reserva, não o planejado. */
  incidente?: boolean;
}

export interface LinhaCapacidade {
  email: string;
  nome: string | null;
  horasDia: number;
  /** Dias úteis que sobraram para esta pessoa depois de feriados e ausências. */
  diasTrabalhados: number;
  /** Dias úteis perdidos: feriado do time + ausência dela. */
  diasFora: number;
  /** Tudo que a pessoa tem na sprint: horas/dia × dias trabalhados. */
  capacidade: number;
  /** Fatia da capacidade separada para incidentes. */
  reservaIncidente: number;
  /** O que sobra para o trabalho planejado (capacidade − reserva). */
  capacidadePlanejada: number;
  /** Horas de cartões normais já alocados. */
  planejado: number;
  /** Horas de cartões marcados como incidente. */
  planejadoIncidente: number;
  /** Livre para planejar (não conta a reserva de incidentes). */
  livre: number;
  /** Quanto ainda cabe de incidente antes de furar a reserva. */
  incidenteLivre: number;
  /** Quanto da capacidade planejada está comprometido, 0–100+. */
  ocupacao: number;
  /** Quanto da reserva de incidentes está consumido, 0–100+. */
  ocupacaoIncidente: number;
  estourou: boolean;
  /** A reserva de incidentes já foi ultrapassada. */
  estourouIncidente: boolean;
  itens: number;
  itensIncidente: number;
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
  reservaTotal: number;
  incidenteTotal: number;
} {
  const folgas = periodo.folgas ?? [];
  const uteis = diasUteis(periodo.inicio, periodo.fim);
  const porPessoa = new Map<string, { horas: number; itens: number; horasInc: number; itensInc: number }>();
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
    const acc = porPessoa.get(email) ?? { horas: 0, itens: 0, horasInc: 0, itensInc: 0 };
    // Incidente e trabalho planejado saem de bolsos diferentes: somar os dois
    // num total só faria a sprint parecer cheia quando ainda há espaço de
    // projeto, ou o contrário.
    if (it.incidente) {
      acc.horasInc += horas;
      acc.itensInc += 1;
    } else {
      acc.horas += horas;
      acc.itens += 1;
    }
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
    const acc = porPessoa.get(email) ?? { horas: 0, itens: 0, horasInc: 0, itensInc: 0 };

    // A reserva nunca passa da capacidade: separar 40 h de incidente para quem
    // tem 30 h na sprint deixaria a capacidade planejada negativa.
    const reserva = Math.min(
      capacidade,
      Math.max(0, Number(p?.horas_incidente ?? 0) || 0)
    );
    const capacidadePlanejada = Math.round((capacidade - reserva) * 100) / 100;

    const planejado = Math.round(acc.horas * 100) / 100;
    const planejadoIncidente = Math.round(acc.horasInc * 100) / 100;

    return {
      email,
      nome: p?.nome ?? nomePorEmail[email] ?? null,
      horasDia,
      diasTrabalhados: dias,
      diasFora: uteis - dias,
      capacidade,
      reservaIncidente: reserva,
      capacidadePlanejada,
      planejado,
      planejadoIncidente,
      livre: Math.round((capacidadePlanejada - planejado) * 100) / 100,
      incidenteLivre: Math.round((reserva - planejadoIncidente) * 100) / 100,
      ocupacao: capacidadePlanejada > 0
        ? Math.round((planejado / capacidadePlanejada) * 1000) / 10
        : planejado > 0 ? 100 : 0,
      ocupacaoIncidente: reserva > 0
        ? Math.round((planejadoIncidente / reserva) * 1000) / 10
        : planejadoIncidente > 0 ? 100 : 0,
      estourou: planejado > capacidadePlanejada,
      estourouIncidente: planejadoIncidente > reserva,
      itens: acc.itens,
      itensIncidente: acc.itensInc,
    };
  });

  linhas.sort((a, b) => (a.nome ?? a.email).localeCompare(b.nome ?? b.email, "pt-BR"));

  const capacidadeTotal = Math.round(linhas.reduce((s, l) => s + l.capacidade, 0) * 100) / 100;
  const reservaTotal = Math.round(linhas.reduce((s, l) => s + l.reservaIncidente, 0) * 100) / 100;
  const incidenteTotal = Math.round(linhas.reduce((s, l) => s + l.planejadoIncidente, 0) * 100) / 100;
  // O total planejado inclui os itens sem dono: eles pesam na sprint mesmo
  // sem estar na conta de ninguém.
  const planejadoTotal = Math.round(
    (linhas.reduce((s, l) => s + l.planejado, 0) + semRespHoras) * 100
  ) / 100;

  return {
    linhas,
    capacidadeTotal,
    planejadoTotal,
    // O livre de planejamento desconta a reserva: ela já tem dono, mesmo que
    // nenhum incidente tenha aparecido ainda.
    livreTotal: Math.round((capacidadeTotal - reservaTotal - planejadoTotal) * 100) / 100,
    semResponsavel: { horas: Math.round(semRespHoras * 100) / 100, itens: semRespItens },
    diasUteisSprint: uteis,
    reservaTotal,
    incidenteTotal,
  };
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

// ============================================================== burndown

export interface PontoBurndown {
  data: string;
  /** Linha guia: o que restaria se o trabalho caísse por igual todo dia. */
  ideal: number;
  /**
   * O que realmente resta ao fim do dia. `null` em dia futuro — desenhar zero
   * ali faria a linha despencar e parecer que a sprint terminou.
   */
  real: number | null;
  /** Horas lançadas neste dia, por todo o time. */
  lancado: number;
}

/**
 * Burndown da sprint: quanto de trabalho ainda falta, dia a dia.
 *
 * O total é a soma dos estimates dos cartões da sprint. Cada hora lançada
 * derruba a linha real. A linha ideal é só uma régua: liga o total no primeiro
 * dia ao zero no último, em dias úteis.
 *
 * Trabalho que entra no meio da sprint sobe a linha real — e deve subir mesmo,
 * porque é escopo novo. Esconder isso é o que faz um burndown mentir.
 */
export function burndown(
  inicio: string,
  fim: string,
  totalEstimado: number,
  lancamentosPorDia: Record<string, number>,
  hojeIso: string
): PontoBurndown[] {
  const dias = datasUteis(inicio, fim);
  if (dias.length === 0) return [];

  const total = Math.max(0, Number(totalEstimado) || 0);
  const passo = dias.length > 1 ? total / (dias.length - 1) : total;

  // Horas lançadas em dias não úteis (alguém trabalhou no sábado) não podem
  // sumir: entram no primeiro dia útil seguinte, senão o total não fecha.
  const uteis = new Set(dias);
  const porDia = new Map<string, number>();
  for (const [data, horas] of Object.entries(lancamentosPorDia ?? {})) {
    const h = Number(horas) || 0;
    if (h <= 0) continue;
    let alvo = data;
    if (!uteis.has(alvo)) {
      const seguinte = dias.find((d) => d >= data);
      alvo = seguinte ?? dias[dias.length - 1];
      if (data < dias[0]) alvo = dias[0];
    }
    porDia.set(alvo, (porDia.get(alvo) ?? 0) + h);
  }

  let acumulado = 0;
  return dias.map((d, i) => {
    const lancado = Math.round((porDia.get(d) ?? 0) * 100) / 100;
    acumulado += lancado;
    return {
      data: d,
      ideal: Math.round(Math.max(0, total - passo * i) * 100) / 100,
      real: d <= hojeIso ? Math.round(Math.max(0, total - acumulado) * 100) / 100 : null,
      lancado,
    };
  });
}

export interface LinhaPrecisao {
  ticket_id: string;
  numero: number | null;
  titulo: string;
  estimate: number;
  lancado: number;
  /** Diferença em horas: positivo = sobrou tempo, negativo = faltou. */
  desvio: number;
  /** Quanto do estimate foi consumido, em %. */
  consumo: number;
  fechado: boolean;
}

export interface Analytics {
  totalEstimado: number;
  totalLancado: number;
  cartoes: number;
  fechados: number;
  porStatus: { id: string; nome: string; qtd: number; horas: number }[];
  porSetor: { id: string; nome: string; qtd: number; horas: number }[];
  porPessoa: { email: string; nome: string | null; planejado: number; lancado: number }[];
  precisao: LinhaPrecisao[];
  /** Média do consumo dos cartões já fechados — a leitura de quão boa é a estimativa. */
  consumoMedioFechados: number | null;
}

export interface ItemAnalytics {
  ticket_id: string;
  numero: number | null;
  titulo: string;
  status: string;
  setor: string;
  responsavel_email: string | null;
  estimate: number | null;
  lancado: number;
}

/**
 * Números da sprint para a aba de Analytics.
 *
 * Tudo sai do que já está gravado: estimate do item, horas apontadas e o
 * status atual do ticket. Nada é recalculado a partir de médias.
 */
export function analytics(
  itens: ItemAnalytics[],
  nomeStatus: Record<string, string>,
  nomeSetor: Record<string, string>,
  nomePorEmail: Record<string, string | null> = {}
): Analytics {
  const porStatus = new Map<string, { qtd: number; horas: number }>();
  const porSetor = new Map<string, { qtd: number; horas: number }>();
  const porPessoa = new Map<string, { planejado: number; lancado: number }>();
  const precisao: LinhaPrecisao[] = [];

  let totalEstimado = 0;
  let totalLancado = 0;
  let fechados = 0;
  const consumos: number[] = [];

  for (const i of itens) {
    const est = Math.max(0, Number(i.estimate ?? 0) || 0);
    const lanc = Math.max(0, Number(i.lancado ?? 0) || 0);
    totalEstimado += est;
    totalLancado += lanc;

    const s = porStatus.get(i.status) ?? { qtd: 0, horas: 0 };
    s.qtd += 1; s.horas += lanc;
    porStatus.set(i.status, s);

    const se = porSetor.get(i.setor) ?? { qtd: 0, horas: 0 };
    se.qtd += 1; se.horas += lanc;
    porSetor.set(i.setor, se);

    const email = (i.responsavel_email ?? "").toLowerCase();
    if (email) {
      const p = porPessoa.get(email) ?? { planejado: 0, lancado: 0 };
      p.planejado += est; p.lancado += lanc;
      porPessoa.set(email, p);
    }

    const fechado = i.status === "finalizado";
    if (fechado) {
      fechados += 1;
      if (est > 0) consumos.push((lanc / est) * 100);
    }

    precisao.push({
      ticket_id: i.ticket_id,
      numero: i.numero,
      titulo: i.titulo,
      estimate: Math.round(est * 100) / 100,
      lancado: Math.round(lanc * 100) / 100,
      desvio: Math.round((est - lanc) * 100) / 100,
      consumo: est > 0 ? Math.round((lanc / est) * 1000) / 10 : 0,
      fechado,
    });
  }

  precisao.sort((a, b) => Math.abs(b.desvio) - Math.abs(a.desvio));

  return {
    totalEstimado: Math.round(totalEstimado * 100) / 100,
    totalLancado: Math.round(totalLancado * 100) / 100,
    cartoes: itens.length,
    fechados,
    porStatus: [...porStatus.entries()].map(([id, v]) => ({
      id, nome: nomeStatus[id] ?? id, qtd: v.qtd, horas: Math.round(v.horas * 100) / 100,
    })),
    porSetor: [...porSetor.entries()]
      .map(([id, v]) => ({ id, nome: nomeSetor[id] ?? id, qtd: v.qtd, horas: Math.round(v.horas * 100) / 100 }))
      .sort((a, b) => b.qtd - a.qtd),
    porPessoa: [...porPessoa.entries()]
      .map(([email, v]) => ({
        email,
        nome: nomePorEmail[email] ?? null,
        planejado: Math.round(v.planejado * 100) / 100,
        lancado: Math.round(v.lancado * 100) / 100,
      }))
      .sort((a, b) => b.lancado - a.lancado),
    precisao,
    consumoMedioFechados: consumos.length > 0
      ? Math.round((consumos.reduce((a, b) => a + b, 0) / consumos.length) * 10) / 10
      : null,
  };
}

// ========================================================= passo das horas

/**
 * Apontamento vai de meia em meia hora.
 *
 * Ninguém cronometra o expediente: "3h18" é uma precisão que a pessoa não tem
 * de verdade e que só atrapalha na hora de somar e comparar. Meia hora é o
 * menor pedaço que alguém consegue afirmar com honestidade sobre o próprio dia.
 */
export const PASSO_HORAS = 0.5;

/** Verdadeiro se `h` é um múltiplo exato do passo e maior que zero. */
export function horaValida(h: number | null | undefined): boolean {
  const n = Number(h);
  if (!Number.isFinite(n) || n <= 0) return false;
  // Em minutos, para não depender de comparação de ponto flutuante.
  const minutos = Math.round(n * 60);
  return Math.abs(minutos - n * 60) < 1e-6 && minutos % 30 === 0;
}

/** Arredonda para o passo mais próximo, nunca abaixo de meia hora. */
export function ajustarAoPasso(h: number | null | undefined): number {
  const n = Number(h);
  if (!Number.isFinite(n) || n <= 0) return PASSO_HORAS;
  return Math.max(PASSO_HORAS, Math.round(n / PASSO_HORAS) * PASSO_HORAS);
}

/**
 * Opções de lançamento até `maximo` horas.
 *
 * O teto acompanha o que ainda cabe no cartão: oferecer um valor que a regra
 * do estimate vai recusar seria convidar ao erro. Com o cartão cheio, devolve
 * lista vazia — a tela já avisa que não cabe mais nada.
 */
export function opcoesDeHoras(maximo: number, teto = 12): number[] {
  const limite = Math.min(teto, Math.floor(Math.max(0, maximo) / PASSO_HORAS) * PASSO_HORAS);
  const opcoes: number[] = [];
  for (let h = PASSO_HORAS; h <= limite + 1e-9; h += PASSO_HORAS) {
    opcoes.push(Math.round(h * 100) / 100);
  }
  return opcoes;
}
