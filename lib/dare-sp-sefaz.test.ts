// node --experimental-strip-types --test lib/dare-sp-sefaz.test.ts
//
// A armadilha nº 1 da Sefaz: o erro chega com HTTP 200 e sem `estaOk`.
// Essa regra é o que separa uma guia emitida de um erro engolido.
import test from "node:test";
import assert from "node:assert/strict";
import { mensagensDeErro, deuCerto, totalConfere } from "./dare-sp-sefaz.ts";

test("erro dentro de `erro.mensagens` é reconhecido", () => {
  const corpo = { erro: { mensagens: ["Código de Serviço não suportado pela API."] } };
  assert.deepEqual(mensagensDeErro(corpo), ["Código de Serviço não suportado pela API."]);
  assert.equal(deuCerto(corpo), false);
});

test("erro em `mensagens` solto também é reconhecido", () => {
  assert.equal(deuCerto({ mensagens: ["qualquer coisa"] }), false);
});

test("resposta sem mensagens é sucesso, mesmo sem `estaOk`", () => {
  // A API omite campos com valor padrão, então `estaOk` pode simplesmente não
  // vir. Exigir estaOk === true recusaria uma emissão que deu certo.
  assert.equal(deuCerto({ documentoImpressao: "JVBER...", valorTotal: 1150 }), true);
});

test("`estaOk: false` sem mensagem não inventa erro", () => {
  assert.equal(deuCerto({ estaOk: false, documentoImpressao: "x" }), true);
});

test("lista de mensagens vazia é sucesso", () => {
  assert.equal(deuCerto({ erro: { mensagens: [] } }), true);
});

test("mensagem em branco não conta como erro", () => {
  assert.equal(deuCerto({ erro: { mensagens: ["  ", ""] } }), true);
});

test("corpo estranho não quebra", () => {
  assert.deepEqual(mensagensDeErro(null), []);
  assert.deepEqual(mensagensDeErro("texto"), []);
  assert.deepEqual(mensagensDeErro({ erro: { mensagens: "não é lista" } }), []);
});

test("um centavo de diferença é tolerado", () => {
  // A Sefaz trunca e nós arredondamos para cima — a diferença é proposital.
  assert.equal(totalConfere(1150.00, 1150.01), true);
  assert.equal(totalConfere(64.55, 64.56), true);
});

test("diferença maior que um centavo não passa", () => {
  assert.equal(totalConfere(1150.00, 1150.50), false);
  assert.equal(totalConfere(1000, 1150), false);
});
