import { test } from "node:test";
import assert from "node:assert/strict";
import { apurar, competenciaAnterior, idEvento, lerConsulta, lerEnvio, xmlLote, xmlR2099 } from "./reinf-regras.ts";

const L = (cnpj: string, debito: number | null) => ({ cnpj, razao_social: cnpj, codigoempresa: 1, debito });

test("competenciaAnterior vira o ano", () => {
  assert.equal(competenciaAnterior("2026-01"), "2025-12");
  assert.equal(competenciaAnterior("2026-11"), "2026-10");
});

test("apurar: movimento em M-1 e nada em M; ignora quem já está sem movimento", () => {
  const ant = [L("11111111000101", 500), L("22222222000101", 300), L("33333333000101", 0), L("44444444000101", 90), L("11111111000202", 10)];
  const atu = [L("22222222000101", 250), L("55555555000101", 80)];
  const r = apurar(ant, atu, new Set(["44444444", "55555555"]));
  assert.deepEqual(r.candidatos.map((c) => c.cnpj), ["11111111000101"]); // filial da mesma raiz não duplica
  assert.equal(r.candidatos[0].debito_anterior, 500);
  assert.deepEqual(r.voltaram, ["55555555"]);
});

test("idEvento tem 36 posições", () => {
  const id = idEvento("12.345.678/0001-90", new Date("2026-11-19T13:05:09Z"), 1);
  assert.equal(id, "ID1123456780000002026111913050900001");
  assert.equal(id.length, 36);
});

test("xmlR2099 sem movimento e lote", () => {
  const x = xmlR2099({ id: "IDX", cnpj: "12345678000190", competencia: "2026-11", ambiente: 2 });
  assert.match(x, /<perApur>2026-11<\/perApur><tpAmb>2<\/tpAmb>/);
  assert.match(x, /<nrInsc>12345678<\/nrInsc>/);
  assert.equal((x.match(/>N</g) ?? []).length, 7);
  assert.match(xmlLote("12345678000190", "IDX", `<?xml version="1.0"?>${x}`), /<evento Id="IDX"><Reinf /);
});

test("lerEnvio / lerConsulta", () => {
  assert.equal(lerEnvio("<a><protocoloEnvio>2.202611.123</protocoloEnvio><cdResposta>1</cdResposta></a>").protocolo, "2.202611.123");
  assert.equal(lerConsulta("<a><cdResposta>1</cdResposta><descResposta>Em processamento</descResposta></a>").estado, "processando");
  const ok = lerConsulta("<a><cdResposta>2</cdResposta><cdRetorno>0</cdRetorno><nrRecArqBase>1234-5</nrRecArqBase></a>");
  assert.deepEqual([ok.estado, ok.recibo], ["aceito", "1234-5"]);
  const ruim = lerConsulta("<a><cdResposta>3</cdResposta><cdRetorno>1</cdRetorno><dscResp>Sem R-1000 vigente</dscResp></a>");
  assert.deepEqual([ruim.estado, ruim.mensagem], ["rejeitado", "Sem R-1000 vigente"]);
});
