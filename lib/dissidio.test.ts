// node --experimental-strip-types --test lib/dissidio.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { calcular, type Ajuste } from "./dissidio-calculo.ts";

function aj(p: Partial<Ajuste>): Ajuste {
  return {
    ano: 2026, codigoempresa: 1, percentual: null, valor_novo: null, valor_base: null,
    origem: "percentual", observacao: null, analisado_por: null,
    analisado_em: new Date().toISOString(), ...p,
  };
}

test("sem ajuste individual, aplica o percentual geral", () => {
  const r = calcular(1000, 5, undefined);
  assert.equal(r.percentual, 5);
  assert.equal(r.valorNovo, 1050);
  assert.equal(r.diferenca, 50);
  assert.equal(r.individual, false);
});

test("percentual individual sobrepõe o geral", () => {
  const r = calcular(1000, 5, aj({ percentual: 3, origem: "percentual" }));
  assert.equal(r.percentual, 3);
  assert.equal(r.valorNovo, 1030);
  assert.equal(r.individual, true, "precisa ficar marcado como exceção à regra geral");
});

test("valor em reais deriva o percentual", () => {
  const r = calcular(1000, 5, aj({ valor_novo: 1080, origem: "valor" }));
  assert.equal(r.valorNovo, 1080);
  assert.equal(r.percentual, 8);
  assert.equal(r.diferenca, 80);
});

test("percentual zero é respeitado e não cai no geral", () => {
  // 0 é falsy — o cálculo não pode confundir "sem reajuste" com "não informado"
  const r = calcular(1000, 7, aj({ percentual: 0, origem: "percentual" }));
  assert.equal(r.percentual, 0);
  assert.equal(r.valorNovo, 1000);
  assert.equal(r.individual, true);
});

test("valor novo zero é respeitado", () => {
  const r = calcular(1000, 7, aj({ valor_novo: 0, origem: "valor" }));
  assert.equal(r.valorNovo, 0);
  assert.equal(r.percentual, -100);
});

test("reajuste negativo funciona", () => {
  const r = calcular(1000, 0, aj({ percentual: -10, origem: "percentual" }));
  assert.equal(r.valorNovo, 900);
  assert.equal(r.diferenca, -100);
});

test("empresa sem mensalidade não quebra", () => {
  const r = calcular(null, 5, undefined);
  assert.equal(r.valorNovo, null);
  assert.equal(r.diferenca, null);
  assert.equal(r.percentual, 5);
});

test("valor informado sem base não inventa percentual", () => {
  const r = calcular(null, 5, aj({ valor_novo: 900, origem: "valor" }));
  assert.equal(r.valorNovo, 900);
  assert.equal(r.percentual, null, "sem base não dá para calcular o percentual");
});

test("base zero não gera divisão por zero", () => {
  const r = calcular(0, 5, aj({ valor_novo: 500, origem: "valor" }));
  assert.equal(r.percentual, null);
  assert.equal(r.valorNovo, 500);
});

test("arredonda para centavos", () => {
  const r = calcular(1333.33, 7.5, undefined);
  assert.equal(r.valorNovo, 1433.33);
});

test("ajuste marcado como valor mas sem valor cai no percentual dele", () => {
  const r = calcular(1000, 5, aj({ origem: "valor", valor_novo: null, percentual: 4 }));
  assert.equal(r.percentual, 4);
  assert.equal(r.valorNovo, 1040);
});
