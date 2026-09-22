// node --experimental-strip-types --test lib/roda-vida-calculo.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  pontosDaRoda, media, respondidas, completa, maisBaixas,
  poligono, vertice, comparar, corDaNota, progressoAcoes,
} from "./roda-vida-calculo.ts";

/** Fixture com os mesmos ids das dimensões reais usados nos casos abaixo. */
const DIMENSOES = [
  { id: "trabalho", nome: "Trabalho", emoji: "💼" },
  { id: "financas", nome: "Finanças", emoji: "💰" },
  { id: "familia", nome: "Família", emoji: "❤️" },
  { id: "amizades", nome: "Amizades", emoji: "🧑" },
  { id: "saude", nome: "Saúde", emoji: "🏃" },
  { id: "emocional", nome: "Saúde emocional", emoji: "🧠" },
  { id: "lazer", nome: "Lazer", emoji: "🎨" },
  { id: "espiritualidade", nome: "Espiritualidade", emoji: "🙏" },
  { id: "eu", nome: "Eu comigo mesmo", emoji: "🌱" },
];

/** Roda cheia, com uma nota diferente por dimensão. */
function rodaCheia(): Record<string, number> {
  const n: Record<string, number> = {};
  DIMENSOES.forEach((d, i) => { n[d.id] = i + 1; });
  return n;
}

// ------------------------------------------------------------ pontos

test("os pontos seguem a ordem fixa das dimensões", () => {
  const p = pontosDaRoda(rodaCheia(), DIMENSOES);
  assert.deepEqual(p.map((x) => x.id), DIMENSOES.map((d) => d.id));
});

test("dimensão sem nota entra como zero, não some", () => {
  const p = pontosDaRoda({ trabalho: 8 }, DIMENSOES);
  assert.equal(p.length, 9, "a roda continua fechada");
  assert.equal(p.find((x) => x.id === "trabalho")!.nota, 8);
  assert.equal(p.find((x) => x.id === "familia")!.nota, 0);
});

test("nota fora da escala é contida", () => {
  const p = pontosDaRoda({ trabalho: 99, familia: -5 }, DIMENSOES);
  assert.equal(p.find((x) => x.id === "trabalho")!.nota, 10);
  assert.equal(p.find((x) => x.id === "familia")!.nota, 0);
});

test("nota inválida não vira NaN", () => {
  const p = pontosDaRoda({ trabalho: "oito" as unknown as number }, DIMENSOES);
  assert.equal(p[0].nota, 0);
});

// -------------------------------------------------------------- média

test("média das notas com uma casa", () => {
  assert.equal(media({ trabalho: 8, familia: 7 }, DIMENSOES), 7.5);
});

test("média ignora dimensão não respondida", () => {
  // Só duas respondidas: a média é das duas, não dividida por nove.
  assert.equal(media({ trabalho: 10, familia: 8 }, DIMENSOES), 9);
});

test("roda vazia tem média zero e não divide por zero", () => {
  assert.equal(media({}, DIMENSOES), 0);
});

test("conta as respondidas e sabe quando fecha", () => {
  assert.equal(respondidas({ trabalho: 5 }, DIMENSOES), 1);
  assert.equal(completa({ trabalho: 5 }, DIMENSOES), false);
  assert.equal(completa(rodaCheia(), DIMENSOES), true);
});

test("nota zero conta como respondida", () => {
  // Zero é uma resposta legítima — e justo a mais importante da dinâmica.
  assert.equal(respondidas({ trabalho: 0 }, DIMENSOES), 1);
});

// --------------------------------------------------------- mais baixas

test("as mais baixas vêm primeiro", () => {
  const b = maisBaixas({ ...rodaCheia(), lazer: 1, eu: 0 }, DIMENSOES, 3);
  assert.equal(b[0].id, "eu");
  assert.equal(b[0].nota, 0);
  assert.equal(b[1].nota, 1);
});

test("empate segue a ordem das dimensões, sem dançar", () => {
  const notas: Record<string, number> = {};
  DIMENSOES.forEach((d) => { notas[d.id] = 5; });
  const a = maisBaixas(notas, DIMENSOES, 3).map((x) => x.id);
  const b = maisBaixas(notas, DIMENSOES, 3).map((x) => x.id);
  assert.deepEqual(a, b);
  assert.deepEqual(a, DIMENSOES.slice(0, 3).map((d) => d.id));
});

test("pedir mais dimensões do que existem devolve todas", () => {
  assert.equal(maisBaixas(rodaCheia(), DIMENSOES, 50).length, 9);
});

// -------------------------------------------------------------- desenho

test("o primeiro vértice fica no topo", () => {
  const v = vertice(0, 9, 100, 100, 50);
  assert.ok(Math.abs(v.x - 100) < 0.001, "centralizado na horizontal");
  assert.ok(v.y < 100, "acima do centro");
});

test("o polígono tem um par de coordenadas por dimensão", () => {
  const p = poligono([1, 2, 3, 4, 5, 6, 7, 8, 9], 100, 100, 80);
  assert.equal(p.split(" ").length, 9);
});

test("nota zero cai no centro", () => {
  const p = poligono([0], 100, 100, 80);
  assert.equal(p, "100.00,100.00");
});

test("polígono sem valores não quebra", () => {
  assert.equal(poligono([], 100, 100, 80), "");
});

// ----------------------------------------------------------- comparação

test("comparação separa o que subiu do que caiu", () => {
  const c = comparar(
    { trabalho: 8, familia: 5, lazer: 7 },
    { trabalho: 6, familia: 5, lazer: 9 },
    DIMENSOES
  );
  assert.equal(c.subiram[0].id, "trabalho");
  assert.equal(c.subiram[0].variacao, 2);
  assert.equal(c.cairam[0].id, "lazer");
  assert.equal(c.cairam[0].variacao, -2);
  assert.equal(c.iguais, 1);
});

test("variação da média sai com uma casa", () => {
  const c = comparar({ trabalho: 8, familia: 7 }, { trabalho: 6, familia: 7 }, DIMENSOES);
  assert.equal(c.mediaAtual, 7.5);
  assert.equal(c.mediaAnterior, 6.5);
  assert.equal(c.variacao, 1);
});

test("dimensão que não existia antes não vira variação", () => {
  const c = comparar({ trabalho: 8, familia: 6 }, { trabalho: 8 }, DIMENSOES);
  const fam = pontosDaRoda({ trabalho: 8, familia: 6 }, DIMENSOES, { trabalho: 8 })
    .find((p) => p.id === "familia")!;
  assert.equal(fam.variacao, null, "sem base de comparação");
  assert.equal(c.iguais, 1, "só trabalho é comparável");
});

// ----------------------------------------------------------------- cores

test("nota baixa é vermelha e nota alta é verde", () => {
  assert.notEqual(corDaNota(2), corDaNota(9));
  assert.equal(corDaNota(0), corDaNota(3), "mesma faixa");
});

// ----------------------------------------------------------------- ações

test("progresso das ações", () => {
  const p = progressoAcoes([{ feita: true }, { feita: false }, { feita: true }, { feita: false }]);
  assert.equal(p.total, 4);
  assert.equal(p.feitas, 2);
  assert.equal(p.pct, 50);
});

test("sem ações, sem porcentagem inventada", () => {
  const p = progressoAcoes([]);
  assert.equal(p.pct, 0);
  assert.equal(p.total, 0);
});

// ============================================================== evolução

import { evolucao } from "./roda-vida-calculo.ts";

const R1 = { id: "a", data: "2026-01-10T12:00:00Z", notas: { trabalho: 4, familia: 6 }, acoes: [{ feita: true }, { feita: false }] };
const R2 = { id: "b", data: "2026-04-10T12:00:00Z", notas: { trabalho: 7, familia: 5 }, acoes: [{ feita: true }] };
const R3 = { id: "c", data: "2026-07-10T12:00:00Z", notas: { trabalho: 9, familia: 5 }, acoes: [] };

test("coloca as rodas em ordem cronológica, venham como vierem", () => {
  const e = evolucao([R3, R1, R2], DIMENSOES);
  assert.deepEqual(e.pontos.map((p) => p.id), ["a", "b", "c"]);
  assert.deepEqual(e.pontos.map((p) => p.numero), [1, 2, 3]);
});

test("a variação é sempre contra a roda anterior", () => {
  const e = evolucao([R1, R2, R3], DIMENSOES);
  assert.equal(e.pontos[0].variacao, null, "a primeira não tem com o que comparar");
  assert.equal(e.pontos[1].media, 6);
  assert.equal(e.pontos[0].media, 5);
  assert.equal(e.pontos[1].variacao, 1);
});

test("a série de cada dimensão tem um valor por roda", () => {
  const e = evolucao([R1, R2, R3], DIMENSOES);
  const trab = e.series.find((s) => s.id === "trabalho")!;
  assert.deepEqual(trab.valores, [4, 7, 9]);
  assert.equal(trab.primeira, 4);
  assert.equal(trab.ultima, 9);
  assert.equal(trab.variacao, 5);
  assert.equal(trab.melhor, 9);
  assert.equal(trab.pior, 4);
});

test("dimensão nunca respondida entra como zero na série", () => {
  const e = evolucao([R1, R2], DIMENSOES);
  const lazer = e.series.find((s) => s.id === "lazer")!;
  assert.deepEqual(lazer.valores, [0, 0]);
  assert.equal(lazer.variacao, 0);
});

test("aponta a maior alta e a maior queda entre a primeira e a última", () => {
  const e = evolucao([R1, R2, R3], DIMENSOES);
  assert.equal(e.maiorAlta!.id, "trabalho");
  assert.equal(e.maiorQueda!.id, "familia", "caiu de 6 para 5");
  assert.equal(e.maiorQueda!.variacao, -1);
});

test("com uma roda só não inventa alta nem queda", () => {
  const e = evolucao([R1], DIMENSOES);
  assert.equal(e.pontos.length, 1);
  assert.equal(e.maiorAlta, null);
  assert.equal(e.maiorQueda, null);
  assert.equal(e.mediaPrimeira, e.mediaUltima);
});

test("sem nenhuma roda não quebra", () => {
  const e = evolucao([], DIMENSOES);
  assert.equal(e.pontos.length, 0);
  assert.equal(e.mediaUltima, 0);
  assert.equal(e.series.length, 9, "as dimensões continuam listadas, vazias");
});

test("conta as ações feitas de cada roda", () => {
  const e = evolucao([R1, R2, R3], DIMENSOES);
  assert.equal(e.pontos[0].acoesFeitas, 1);
  assert.equal(e.pontos[0].acoesTotal, 2);
  assert.equal(e.pontos[2].acoesTotal, 0);
});

test("tudo igual entre as rodas: nem alta nem queda", () => {
  const e = evolucao([
    { id: "x", data: "2026-01-01", notas: { trabalho: 5 } },
    { id: "y", data: "2026-02-01", notas: { trabalho: 5 } },
  ], DIMENSOES);
  assert.equal(e.maiorAlta, null);
  assert.equal(e.maiorQueda, null);
  assert.equal(e.pontos[1].variacao, 0);
});
