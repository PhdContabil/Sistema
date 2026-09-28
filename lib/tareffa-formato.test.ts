// node --experimental-strip-types --test lib/tareffa-formato.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { nomeTareffa } from "./tareffa-formato.ts";

test("mesmo tratamento do front do Tareffa", () => {
  assert.equal(nomeTareffa("TESTE_API.pdf"), "testeapi.pdf");
});

test("título do Zen vira o nome interno que o Tareffa lê", () => {
  // Log real: NOMEINTERNO = ICMSDIFERENCIALDEALIQUOTA046-2SP
  assert.equal(
    nomeTareffa("ICMS Diferencial de aliquota 046-2 SP 08-2026.pdf"),
    "icmsdiferencialdealiquota046-2sp08-2026.pdf"
  );
});

test("acento e cedilha somem sem levar a letra junto", () => {
  assert.equal(nomeTareffa("ICMS Operações Próprias SP.PDF"), "icmsoperacoesproprias.pdf".replace("proprias", "propriassp"));
});

test("sem extensão continua sem extensão", () => {
  assert.equal(nomeTareffa("Guia"), "guia");
});
