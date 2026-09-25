// node --experimental-strip-types --test lib/dare-sp-zen.test.ts
//
// Só os formatadores puros. O envio em si bate no Questor Zen e não entra em
// teste — mas o nome do arquivo e o formato de data/valor, sim: errar aqui
// grava o documento no Edoc com atributo em branco ou com barra no nome.
import test from "node:test";
import assert from "node:assert/strict";
import { dataBR, valorBR, nomeDoArquivo } from "./dare-sp-zen-formato.ts";

test("data ISO vira o formato do Zen", () => {
  assert.equal(dataBR("2026-09-30"), "30/09/2026");
});

test("data fora do formato não vira string torta", () => {
  assert.equal(dataBR("30/09/2026"), "");
  assert.equal(dataBR(""), "");
});

test("valor sai com vírgula decimal e duas casas", () => {
  assert.equal(valorBR(1130), "1130,00");
  assert.equal(valorBR(64.5), "64,50");
  assert.equal(valorBR(0.05), "0,05");
});

test("valor inválido vira vazio, não NaN", () => {
  assert.equal(valorBR(NaN), "");
  assert.equal(valorBR(Infinity), "");
});

test("a barra da competência não entra no nome do arquivo", () => {
  // Com barra, o nome viraria caminho na URL do upload.
  const n = nomeDoArquivo("12.345.678/0001-90", "08/2026");
  assert.ok(!n.includes("/"), `nome com barra: ${n}`);
  assert.equal(n, "DARE-SP 08-2026 12345678000190.pdf");
});

test("o nome carrega o CNPJ só com dígitos", () => {
  assert.ok(nomeDoArquivo("12.345.678/0001-90", "01/2026").includes("12345678000190"));
});

test("entrada vazia ainda produz um nome válido", () => {
  const n = nomeDoArquivo("", "");
  assert.ok(n.endsWith(".pdf"));
  assert.ok(!n.includes("/"));
});
