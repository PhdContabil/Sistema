// Roda da Vida — cálculo puro. Sem Supabase, sem React.
// node --experimental-strip-types --test lib/roda-vida-calculo.test.ts

// Sem import nenhum, de propósito: `node --experimental-strip-types` não
// resolve caminho relativo sem extensão, e a extensão quebraria o build do
// Next. A lista de dimensões entra por parâmetro — o que também deixa cada
// função testável com um conjunto pequeno, em vez de depender das nove reais.

export type Notas = Record<string, number>;

/** O mínimo que o cálculo precisa saber de uma dimensão. */
export interface DimensaoBase {
  id: string;
  nome: string;
  emoji: string;
}

/** Um vértice da roda, já pronto para desenhar. */
export interface PontoRoda {
  id: string;
  nome: string;
  emoji: string;
  nota: number;
  /** Nota da roda anterior, quando existe — para a comparação. */
  anterior: number | null;
  variacao: number | null;
}

/**
 * Monta os pontos da roda na ordem fixa das dimensões.
 *
 * Dimensão sem nota entra como 0: a roda precisa ser um polígono fechado, e
 * pular um vértice distorceria a figura inteira. Quem não respondeu aparece
 * com o vazio visível, que é a leitura honesta.
 */
export function pontosDaRoda(
  notas: Notas,
  dimensoes: DimensaoBase[],
  anteriores?: Notas | null
): PontoRoda[] {
  return dimensoes.map((d) => {
    const nota = limitar(notas?.[d.id]);
    const ant = anteriores && anteriores[d.id] !== undefined ? limitar(anteriores[d.id]) : null;
    return {
      id: d.id,
      nome: d.nome,
      emoji: d.emoji,
      nota,
      anterior: ant,
      variacao: ant === null ? null : Math.round((nota - ant) * 10) / 10,
    };
  });
}

function limitar(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(10, Math.max(0, n));
}

/** Média geral da roda, com uma casa. */
export function media(notas: Notas, dimensoes: DimensaoBase[]): number {
  const vs = dimensoes.map((d) => notas?.[d.id]).filter((v) => v !== undefined && v !== null);
  if (vs.length === 0) return 0;
  const soma = vs.reduce((s: number, v) => s + limitar(v), 0);
  return Math.round((soma / vs.length) * 10) / 10;
}

/** Quantas dimensões já têm nota — a roda só fecha com todas. */
export function respondidas(notas: Notas, dimensoes: DimensaoBase[]): number {
  return dimensoes.filter((d) => notas?.[d.id] !== undefined && notas[d.id] !== null).length;
}

export function completa(notas: Notas, dimensoes: DimensaoBase[]): boolean {
  return respondidas(notas, dimensoes) === dimensoes.length;
}

/**
 * As dimensões que mais pedem atenção: as de menor nota.
 *
 * Empate é desempatado pela ordem das dimensões, para a sugestão não mudar
 * sozinha a cada abertura da tela — sugestão que dança perde a confiança.
 */
export function maisBaixas(notas: Notas, dimensoes: DimensaoBase[], quantas = 3): PontoRoda[] {
  const pontos = pontosDaRoda(notas, dimensoes);
  const ordem = new Map(dimensoes.map((d, i) => [d.id, i]));
  return [...pontos]
    .sort((a, b) => (a.nota - b.nota) || ((ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0)))
    .slice(0, Math.max(0, quantas));
}

/** Coordenadas do polígono da roda, para o SVG. */
export function poligono(
  valores: number[],
  cx: number,
  cy: number,
  raio: number,
  maximo = 10
): string {
  const n = valores.length;
  if (n === 0) return "";
  return valores
    .map((v, i) => {
      const p = vertice(i, n, cx, cy, (limitar(v) / maximo) * raio);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(" ");
}

/**
 * Posição de um vértice. Começa no topo e anda no sentido horário, que é como
 * as rodas da vida são desenhadas — a primeira dimensão fica em cima.
 */
export function vertice(
  i: number,
  total: number,
  cx: number,
  cy: number,
  raio: number
): { x: number; y: number } {
  const ang = (Math.PI * 2 * i) / total - Math.PI / 2;
  return { x: cx + raio * Math.cos(ang), y: cy + raio * Math.sin(ang) };
}

export interface Comparacao {
  mediaAtual: number;
  mediaAnterior: number;
  variacao: number;
  subiram: PontoRoda[];
  cairam: PontoRoda[];
  iguais: number;
}

/** Comparação entre duas rodas da mesma pessoa. */
export function comparar(atual: Notas, anterior: Notas, dimensoes: DimensaoBase[]): Comparacao {
  const pontos = pontosDaRoda(atual, dimensoes, anterior);
  const comVariacao = pontos.filter((p) => p.variacao !== null);
  const mediaAtual = media(atual, dimensoes);
  const mediaAnterior = media(anterior, dimensoes);
  return {
    mediaAtual,
    mediaAnterior,
    variacao: Math.round((mediaAtual - mediaAnterior) * 10) / 10,
    subiram: comVariacao.filter((p) => (p.variacao ?? 0) > 0).sort((a, b) => (b.variacao ?? 0) - (a.variacao ?? 0)),
    cairam: comVariacao.filter((p) => (p.variacao ?? 0) < 0).sort((a, b) => (a.variacao ?? 0) - (b.variacao ?? 0)),
    iguais: comVariacao.filter((p) => p.variacao === 0).length,
  };
}

/** Cor da nota: vermelho pede atenção, verde está bem. */
export function corDaNota(nota: number): string {
  const n = limitar(nota);
  if (n <= 3) return "#dc2626";
  if (n <= 6) return "#d97706";
  if (n <= 8) return "#16a34a";
  return "#059669";
}

export interface ProgressoAcoes {
  total: number;
  feitas: number;
  pct: number;
}

export function progressoAcoes(acoes: { feita: boolean }[]): ProgressoAcoes {
  const total = acoes?.length ?? 0;
  const feitas = (acoes ?? []).filter((a) => a.feita).length;
  return { total, feitas, pct: total > 0 ? Math.round((feitas / total) * 100) : 0 };
}

// ============================================================== evolução

export interface RodaResumida {
  id: string;
  /** Quando a roda foi fechada. */
  data: string;
  notas: Notas;
  acoes?: { feita: boolean }[];
}

export interface PontoEvolucao {
  id: string;
  data: string;
  /** Ordem cronológica, 1 = a mais antiga. Serve de rótulo curto ("1ª roda"). */
  numero: number;
  media: number;
  notas: Notas;
  /** Variação da média em relação à roda imediatamente anterior. */
  variacao: number | null;
  acoesFeitas: number;
  acoesTotal: number;
}

export interface SerieDimensao {
  id: string;
  nome: string;
  emoji: string;
  /** Uma nota por roda, na mesma ordem de `pontos`. */
  valores: number[];
  primeira: number;
  ultima: number;
  variacao: number;
  /** Maior e menor nota que a dimensão já teve. */
  melhor: number;
  pior: number;
}

export interface Evolucao {
  pontos: PontoEvolucao[];
  series: SerieDimensao[];
  /** Quem mais subiu e quem mais caiu entre a primeira e a última roda. */
  maiorAlta: SerieDimensao | null;
  maiorQueda: SerieDimensao | null;
  mediaPrimeira: number;
  mediaUltima: number;
}

/**
 * Linha do tempo das rodas de uma pessoa.
 *
 * Recebe as rodas em qualquer ordem e devolve em ordem cronológica — a tela
 * guarda o histórico do mais recente para o mais antigo, e um gráfico de
 * evolução lido de trás para a frente enganaria.
 *
 * Com uma roda só ainda devolve tudo: a série tem um ponto, a variação é zero
 * e a tela mostra "sem comparação ainda" em vez de um gráfico vazio.
 */
export function evolucao(rodas: RodaResumida[], dimensoes: DimensaoBase[]): Evolucao {
  const ordenadas = [...(rodas ?? [])].sort((a, b) => a.data.localeCompare(b.data));

  const pontos: PontoEvolucao[] = ordenadas.map((r, i) => {
    const m = media(r.notas, dimensoes);
    const anterior = i > 0 ? media(ordenadas[i - 1].notas, dimensoes) : null;
    const acoes = r.acoes ?? [];
    return {
      id: r.id,
      data: r.data,
      numero: i + 1,
      media: m,
      notas: r.notas,
      variacao: anterior === null ? null : Math.round((m - anterior) * 10) / 10,
      acoesFeitas: acoes.filter((a) => a.feita).length,
      acoesTotal: acoes.length,
    };
  });

  const series: SerieDimensao[] = dimensoes.map((d) => {
    const valores = ordenadas.map((r) => limitar(r.notas?.[d.id]));
    const primeira = valores[0] ?? 0;
    const ultima = valores[valores.length - 1] ?? 0;
    return {
      id: d.id,
      nome: d.nome,
      emoji: d.emoji,
      valores,
      primeira,
      ultima,
      variacao: Math.round((ultima - primeira) * 10) / 10,
      melhor: valores.length > 0 ? Math.max(...valores) : 0,
      pior: valores.length > 0 ? Math.min(...valores) : 0,
    };
  });

  // Com menos de duas rodas não há alta nem queda para apontar.
  const comparaveis = ordenadas.length >= 2 ? [...series] : [];
  const porVariacao = [...comparaveis].sort((a, b) => b.variacao - a.variacao);
  const alta = porVariacao[0];
  const queda = porVariacao[porVariacao.length - 1];

  return {
    pontos,
    series,
    maiorAlta: alta && alta.variacao > 0 ? alta : null,
    maiorQueda: queda && queda.variacao < 0 ? queda : null,
    mediaPrimeira: pontos[0]?.media ?? 0,
    mediaUltima: pontos[pontos.length - 1]?.media ?? 0,
  };
}
