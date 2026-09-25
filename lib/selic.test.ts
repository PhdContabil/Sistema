// node --experimental-strip-types --test lib/selic.test.ts
//
// Só as partes puras: conversão da resposta do SGS e checagem de meses
// faltando. O fetch em si depende do BCB e não entra em teste.
import test from "node:test";
import assert from "node:assert/strict";
import { competenciaDaLinha, mesCorrente, montarSerie, mesesFaltando } from "./selic.ts";

test("data do SGS vira competência", () => {
  assert.equal(competenciaDaLinha("01/07/2026"), "2026-07");
  assert.equal(competenciaDaLinha("31/12/2017"), "2017-12");
});

test("data fora do formato não vira competência", () => {
  assert.equal(competenciaDaLinha("2026-07-01"), null);
  assert.equal(competenciaDaLinha(""), null);
});

test("mês corrente sai no fuso de São Paulo", () => {
  // 1º de janeiro às 02h UTC ainda é 31/12 em São Paulo.
  assert.equal(mesCorrente(new Date("2027-01-01T02:00:00Z")), "2026-12");
});

const LINHAS = [
  { data: "01/06/2026", valor: "0,90" },
  { data: "01/07/2026", valor: "1,00" },
  { data: "01/08/2026", valor: "1,10" },
  { data: "01/09/2026", valor: "0,45" },
];
const AGORA = new Date("2026-09-15T12:00:00Z");

test("o mês corrente fica de fora — vem pela metade", () => {
  const s = montarSerie(LINHAS, AGORA);
  assert.equal(s["2026-08"], 1.1);
  assert.equal(s["2026-09"], undefined, "setembro é o mês corrente");
});

test("vírgula decimal do BCB vira ponto", () => {
  const s = montarSerie([{ data: "01/07/2026", valor: "1,23" }], AGORA);
  assert.equal(s["2026-07"], 1.23);
});

test("linha inválida é ignorada, não vira NaN", () => {
  const s = montarSerie([
    { data: "01/07/2026", valor: "abc" },
    { data: "lixo", valor: "1,00" },
  ], AGORA);
  assert.deepEqual(Object.keys(s), []);
});

test("lista vazia não quebra", () => {
  assert.deepEqual(montarSerie([], AGORA), {});
});

test("aponta os meses que faltam no intervalo", () => {
  const s = { "2026-07": 1.0 };
  assert.deepEqual(mesesFaltando(s, "2026-07", "2026-09"), ["2026-08", "2026-09"]);
});

test("série completa não acusa falta", () => {
  const s = { "2026-07": 1.0, "2026-08": 1.0 };
  assert.deepEqual(mesesFaltando(s, "2026-07", "2026-08"), []);
});

test("intervalo que vira o ano é percorrido inteiro", () => {
  assert.deepEqual(mesesFaltando({}, "2026-11", "2027-01"), ["2026-11", "2026-12", "2027-01"]);
});
