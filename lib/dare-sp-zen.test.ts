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

import { acharCategoria, listarCategorias, normalizar } from "./dare-sp-zen-formato.ts";

const ARVORE = [
  { Codigo: "1", Descricao: "Societário", Categorias: [{ Codigo: "11", Descricao: "Contratos" }] },
  { Codigo: "2", Descricao: "TRIBUTARIO ", Categorias: [
    { Codigo: "21", Descricao: "Tributos  Federais" },
    { Codigo: "22", Descricao: "tributos estaduais" },
  ] },
];

test("categoria é achada sem ligar para acento, caixa e espaço", () => {
  assert.equal(acharCategoria(ARVORE, "Tributário", "Tributos Estaduais"), "22");
});

test("categoria em nível mais fundo também é achada", () => {
  const a = [{ Codigo: "9", Descricao: "Fiscal", Categorias: [{ Codigo: "90", Descricao: "Tributário", Categorias: [{ Codigo: "901", Descricao: "Tributos Estaduais" }] }] }];
  assert.equal(acharCategoria(a, "Tributário", "Tributos Estaduais"), "901");
});

test("pai com outro nome: filha única na árvore serve", () => {
  const a = [{ Codigo: "3", Descricao: "Impostos", Categorias: [{ Codigo: "31", Descricao: "Tributos Estaduais" }] }];
  assert.equal(acharCategoria(a, "Tributário", "Tributos Estaduais"), "31");
});

test("filha repetida sem o pai certo: não chuta", () => {
  const a = [
    { Codigo: "3", Descricao: "A", Categorias: [{ Codigo: "31", Descricao: "Tributos Estaduais" }] },
    { Codigo: "4", Descricao: "B", Categorias: [{ Codigo: "41", Descricao: "Tributos Estaduais" }] },
  ];
  assert.equal(acharCategoria(a, "Tributário", "Tributos Estaduais"), null);
});

test("lista as categorias existentes para o erro", () => {
  assert.deepEqual(listarCategorias(ARVORE), ["Societário › Contratos", "TRIBUTARIO  › Tributos  Federais", "TRIBUTARIO  › tributos estaduais"]);
  assert.equal(normalizar("  Tributário  X "), "tributario x");
});
