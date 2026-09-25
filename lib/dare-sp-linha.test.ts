// node --experimental-strip-types --test lib/dare-sp-linha.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  apenasDigitos, dvModulo10, dvModulo11,
  linhaDigitavel, linhaFormatada, linhaValida, codigoDeBarras,
} from "./dare-sp-linha.ts";

/** 44 dígitos com identificador de valor 6 (módulo 10). */
const BARRAS_M10 = "84660000000100000000000000000000000000000000";
/** O mesmo, com identificador 8 (módulo 11). */
const BARRAS_M11 = "84860000000100000000000000000000000000000000";

test("tira máscara e espaço", () => {
  assert.equal(apenasDigitos("846 6000.0001 00000"), "8466000000100000");
  assert.equal(apenasDigitos(""), "");
});

// ------------------------------------------------------------ módulo 10

test("módulo 10 soma os algarismos quando o produto passa de 9", () => {
  // 7 × 2 = 14 → 1+4 = 5. Somar 14 daria outro dígito.
  assert.equal(dvModulo10("00000000007"), 5 === 0 ? 0 : 10 - 5);
});

test("bloco zerado tem DV zero", () => {
  assert.equal(dvModulo10("00000000000"), 0);
});

test("resto zero vira DV zero, não 10", () => {
  // Um DV de dois dígitos não caberia na linha.
  const dv = dvModulo10("00000000005");
  assert.ok(dv >= 0 && dv <= 9);
});

// ------------------------------------------------------------ módulo 11

test("módulo 11 usa pesos de 2 a 9, ciclando", () => {
  assert.equal(dvModulo11("00000000000"), 0);
  const dv = dvModulo11("12345678901");
  assert.ok(dv >= 0 && dv <= 9);
});

test("restos 0 e 1 viram DV zero", () => {
  // Sem essa regra sairia 11 ou 10, que não cabem num dígito.
  for (let i = 0; i < 200; i++) {
    const bloco = String(i).padStart(11, "0");
    const dv = dvModulo11(bloco);
    assert.ok(dv >= 0 && dv <= 9, `DV fora da faixa em ${bloco}: ${dv}`);
  }
});

// ------------------------------------------------------------- a linha

test("44 dígitos viram 48", () => {
  const l = linhaDigitavel(BARRAS_M10)!;
  assert.equal(l.length, 48);
});

test("cada bloco carrega os 11 dígitos originais", () => {
  const l = linhaDigitavel(BARRAS_M10)!;
  assert.equal(l.slice(0, 11), BARRAS_M10.slice(0, 11));
  assert.equal(l.slice(12, 23), BARRAS_M10.slice(11, 22));
  assert.equal(l.slice(24, 35), BARRAS_M10.slice(22, 33));
  assert.equal(l.slice(36, 47), BARRAS_M10.slice(33, 44));
});

test("a linha gerada valida contra ela mesma", () => {
  assert.equal(linhaValida(linhaDigitavel(BARRAS_M10)!), true);
  assert.equal(linhaValida(linhaDigitavel(BARRAS_M11)!), true);
});

test("ida e volta devolve o código de barras original", () => {
  assert.equal(codigoDeBarras(linhaDigitavel(BARRAS_M10)!), BARRAS_M10);
  assert.equal(codigoDeBarras(linhaDigitavel(BARRAS_M11)!), BARRAS_M11);
});

test("o identificador de valor escolhe o módulo", () => {
  // Mesmo corpo, identificador diferente: as linhas têm de diferir, senão
  // estaríamos aplicando o módulo errado num dos casos.
  const a = linhaDigitavel(BARRAS_M10)!;
  const b = linhaDigitavel(BARRAS_M11)!;
  assert.notEqual(a, b);
});

test("tamanho errado não vira linha", () => {
  assert.equal(linhaDigitavel("123"), null);
  assert.equal(linhaDigitavel(""), null);
  assert.equal(linhaDigitavel(BARRAS_M10 + "9"), null);
});

test("identificador de valor inválido não vira linha", () => {
  // Só 6, 7, 8 e 9 existem em arrecadação. Chutar o módulo geraria uma linha
  // que o banco recusa só na hora de pagar.
  const ruim = "84160000000100000000000000000000000000000000";
  assert.equal(linhaDigitavel(ruim), null);
});

test("um dígito trocado invalida a linha", () => {
  const l = linhaDigitavel(BARRAS_M10)!;
  const alterada = l.slice(0, 5) + (l[5] === "9" ? "0" : "9") + l.slice(6);
  assert.equal(linhaValida(alterada), false);
});

test("linha formatada sai em 4 blocos de 12", () => {
  const f = linhaFormatada(BARRAS_M10)!;
  const blocos = f.split(" ");
  assert.equal(blocos.length, 4);
  for (const b of blocos) assert.equal(b.length, 12);
});

test("entrada inválida não formata", () => {
  assert.equal(linhaFormatada("abc"), null);
  assert.equal(linhaValida("123"), false);
  assert.equal(codigoDeBarras("123"), null);
});
