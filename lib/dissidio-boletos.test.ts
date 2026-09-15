// node --experimental-strip-types --test lib/dissidio-boletos.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { casarBoletos } from "./dissidio-boletos.ts";

test("casa pelo código financeiro quando ok = true", () => {
  const r = casarBoletos(
    [{ aba: "Contabil", codigofinanceiro: 57170, empresa: "JA MODA", ok: true }],
    [{ codigoempresa: 3681, codigocliente: 57170, nome: "JA MODA E CONFECCAO LTDA" }]
  );
  assert.equal(r.gerados.length, 1);
  assert.equal(r.gerados[0].codigoempresa, 3681);
  assert.equal(r.gerados[0].aba, "Contabil");
});

test("linha sem ok não gera nada", () => {
  const r = casarBoletos(
    [{ aba: "Contabil", codigofinanceiro: 57170, empresa: "JA MODA", ok: false }],
    [{ codigoempresa: 3681, codigocliente: 57170, nome: "JA MODA E CONFECCAO LTDA" }]
  );
  assert.equal(r.gerados.length, 0);
});

test("código financeiro sem empresa correspondente é reportado", () => {
  const r = casarBoletos(
    [{ aba: "Digital", codigofinanceiro: 99999, empresa: "FANTASMA", ok: true }],
    [{ codigoempresa: 1, codigocliente: 1, nome: "OUTRA" }]
  );
  assert.equal(r.gerados.length, 0);
  assert.equal(r.semEmpresa.length, 1);
  assert.equal(r.semEmpresa[0].codigofinanceiro, 99999);
});

test("código financeiro em mais de uma empresa vira ambíguo, não escolhe no chute", () => {
  const r = casarBoletos(
    [{ aba: "Negocios", codigofinanceiro: 500, empresa: "MATRIZ/FILIAL", ok: true }],
    [
      { codigoempresa: 1, codigocliente: 500, nome: "MATRIZ" },
      { codigoempresa: 2, codigocliente: 500, nome: "FILIAL" },
    ]
  );
  assert.equal(r.gerados.length, 0);
  assert.equal(r.ambiguos.length, 1);
  assert.deepEqual(r.ambiguos[0].candidatos.sort(), [1, 2]);
});

test("mesma empresa em duas abas não é contada duas vezes", () => {
  const r = casarBoletos(
    [
      { aba: "Contabil", codigofinanceiro: 57170, empresa: "JA MODA", ok: true },
      { aba: "Negocios", codigofinanceiro: 57170, empresa: "JA MODA", ok: true },
    ],
    [{ codigoempresa: 3681, codigocliente: 57170, nome: "JA MODA E CONFECCAO LTDA" }]
  );
  assert.equal(r.gerados.length, 1);
  assert.equal(r.gerados[0].aba, "Contabil", "fica com a primeira aba onde bateu");
});

test("empresa sem codigocliente cadastrado não casa com nada", () => {
  const r = casarBoletos(
    [{ aba: "Contabil", codigofinanceiro: 57170, empresa: "X", ok: true }],
    [{ codigoempresa: 1, codigocliente: null, nome: "X" }]
  );
  assert.equal(r.gerados.length, 0);
  assert.equal(r.semEmpresa.length, 1);
});
