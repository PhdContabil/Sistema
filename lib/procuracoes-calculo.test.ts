// node --experimental-strip-types --test lib/procuracoes-calculo.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { diasAte, interpretarRetorno, parseDataExp, vigencia } from "./procuracoes-calculo.ts";

const HOJE = "2026-11-17";

test("parseDataExp", () => {
  assert.equal(parseDataExp("20300502"), "2030-05-02");
  assert.equal(parseDataExp(""), null);
});

test("lista vazia = inexistente", () => {
  assert.deepEqual(interpretarRetorno([], HOJE), { situacao: "inexistente", data_fim: null, servicos: [] });
});

test("vale a menor expiração entre os serviços", () => {
  const r = interpretarRetorno([
    { dtexpiracao: "20280101", sistemas: ["DCTFWEB"], nrsistemas: 1 },
    { dtexpiracao: "20270315", sistemas: ["SITFIS", "PGDAS"], nrsistemas: 2 },
  ], HOJE);
  assert.equal(r.situacao, "ativa");
  assert.equal(r.data_fim, "2027-03-15");
  assert.equal(r.servicos.length, 2);
});

test("expiração passada = vencida", () => {
  assert.equal(interpretarRetorno([{ dtexpiracao: "20261001", sistemas: [] }], HOJE).situacao, "vencida");
});

test("vigência recalculada pela data", () => {
  const base = { situacao: "ativa", ultima_consulta: "2026-08-01T00:00:00Z" };
  assert.equal(vigencia({ ...base, data_fim: "2026-10-17" }, HOJE), "vencida");   // gravada como ativa, já venceu
  assert.equal(vigencia({ ...base, data_fim: "2027-01-10" }, HOJE), "vencendo");
  assert.equal(vigencia({ ...base, data_fim: "2028-01-10" }, HOJE), "em_dia");
  assert.equal(vigencia({ situacao: "inexistente", data_fim: null, ultima_consulta: "x" }, HOJE), "sem_procuracao");
  assert.equal(vigencia({ situacao: null, data_fim: null, ultima_consulta: null }, HOJE), "nunca");
  assert.equal(diasAte("2026-11-27", HOJE), 10);
});
