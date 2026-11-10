// node --experimental-strip-types --test lib/expressao-valor.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { avaliarValor, formatarValorCampo, resolverCampo, temConta } from "./expressao-valor.ts";

const v = (t: string) => { const r = avaliarValor(t); return r.ok ? r.valor : null; };

test("soma e subtração do chamado: 100+20 = 120 e 90-10 = 80", () => {
  assert.equal(v("100+20"), 120);
  assert.equal(v("90-10"), 80);
  assert.equal(v(" 100 + 20 - 5 "), 115);
});

test("vírgula decimal, milhar e centavos sem erro de ponto flutuante", () => {
  assert.equal(v("10,5+0,1"), 10.6);
  assert.equal(v("0,1+0,2"), 0.3);
  assert.equal(v("1.234,56+0,44"), 1235);
  assert.equal(v("12.5+2.5"), 15);
  assert.equal(v("42312,89"), 42312.89);
});

test("campo vazio vale 0; conta inválida é recusada", () => {
  assert.equal(v(""), 0);
  assert.equal(v("   "), 0);
  for (const t of ["abc", "10++5", "10+", "+", "10*2", "(1+2)", "1,2,3+4", "1e3+1"]) assert.equal(v(t), null, t);
});

test("resolverCampo: normaliza a conta, deixa número simples como está e recusa negativo", () => {
  assert.equal(resolverCampo("100+20", "Rendimentos"), "120,00");
  assert.equal(resolverCampo("90-10", "Rendimentos"), "80,00");
  assert.equal(resolverCampo("10,85", "Rendimentos"), "10,85");
  assert.equal(resolverCampo("", "Rendimentos"), "");
  assert.throws(() => resolverCampo("10-20", "Retenção"), /Retenção: o resultado não pode ser negativo/);
  assert.throws(() => resolverCampo("10*2", "Dividendos"), /Dividendos: use só números/);
  assert.equal(temConta("100+20"), true);
  assert.equal(temConta("100"), false);
  assert.equal(formatarValorCampo(120), "120,00");
});
