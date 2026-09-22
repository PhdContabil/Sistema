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
