// node --experimental-strip-types --test lib/dare-sp-calculo.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  diasDeAtraso, calcularMulta, calcularJuros, regraDoTermoInicial,
  receitaSugerida, arredondar, montarGuia, FAIXAS_MULTA,
} from "./dare-sp-calculo.ts";

/** Selic de referência, em % ao mês. Valores fictícios e redondos. */
const SELIC = {
  "2026-07": 1.0,
  "2026-08": 1.0,
  "2026-09": 1.0,
  "2026-10": 1.0,
  "2023-11": 0.9,
  "2023-12": 0.9,
  "2024-01": 0.9,
};

// ------------------------------------------------------------- dias

test("conta os dias corridos entre vencimento e pagamento", () => {
  assert.equal(diasDeAtraso("2026-06-20", "2026-09-15"), 87);
  assert.equal(diasDeAtraso("2026-09-10", "2026-09-11"), 1);
});

test("pagamento em dia ou adiantado não é atraso", () => {
  assert.equal(diasDeAtraso("2026-09-10", "2026-09-10"), 0);
  assert.ok(diasDeAtraso("2026-09-10", "2026-09-05") < 0);
});

test("data inválida não vira NaN", () => {
  assert.equal(diasDeAtraso("2026-02-31", "2026-09-10"), 0, "31 de fevereiro não existe");
  assert.equal(diasDeAtraso("20/06/2026", "2026-09-10"), 0);
  assert.equal(diasDeAtraso("", ""), 0);
});

// ------------------------------------------------------------ multa

test("as três faixas do art. 528", () => {
  assert.equal(FAIXAS_MULTA.length, 3);
  assert.equal(calcularMulta(1000, "2026-09-01", "2026-09-15").percentual, 2, "15 dias");
  assert.equal(calcularMulta(1000, "2026-09-01", "2026-10-01").percentual, 2, "30 dias, ainda 2%");
  assert.equal(calcularMulta(1000, "2026-09-01", "2026-10-02").percentual, 5, "31 dias vira 5%");
  assert.equal(calcularMulta(1000, "2026-09-01", "2026-10-31").percentual, 5, "60 dias");
  assert.equal(calcularMulta(1000, "2026-09-01", "2026-11-01").percentual, 10, "61 dias vira 10%");
});

test("a multa incide sobre o imposto", () => {
  const m = calcularMulta(1000, "2026-06-20", "2026-09-15");
  assert.equal(m.percentual, 10);
  assert.equal(m.valor, 100);
  assert.equal(m.dias, 87);
});

test("sem atraso não há multa", () => {
  const m = calcularMulta(1000, "2026-09-10", "2026-09-10");
  assert.equal(m.valor, 0);
  assert.equal(m.descricao, "sem atraso");
});

test("principal zero ou negativo não gera multa negativa", () => {
  assert.equal(calcularMulta(0, "2026-01-01", "2026-12-01").valor, 0);
  assert.equal(calcularMulta(-500, "2026-01-01", "2026-12-01").valor, 0);
});

// ------------------------------------------------- termo inicial dos juros

test("o Decreto 68.043/2023 separa as duas regras", () => {
  assert.equal(regraDoTermoInicial("2023-10-31"), "antigo");
  assert.equal(regraDoTermoInicial("2023-11-01"), "novo");
  assert.equal(regraDoTermoInicial("2026-06-20"), "novo");
});

// ------------------------------------------------------------ juros

test("meses cheios mais 1% da fração do mês do pagamento", () => {
  // Vencimento 20/06, pagamento 15/09: cheios = jul e ago; set é fração.
  const j = calcularJuros(1000, "2026-06-20", "2026-09-15", SELIC);
  assert.deepEqual(j.meses.map((m) => m.competencia), ["2026-07", "2026-08"]);
  assert.equal(j.percentual, 3, "1 + 1 + 1% de fração");
  assert.equal(j.valor, 30);
  assert.equal(j.fracao, true);
});

test("pagamento no mês seguinte: só a fração", () => {
  const j = calcularJuros(1000, "2026-06-20", "2026-07-05", SELIC);
  assert.equal(j.meses.length, 0, "nenhum mês cheio");
  assert.equal(j.percentual, 1);
});

test("regra antiga cobra também a fração do mês do vencimento", () => {
  // Vencimento 10/10/2023 (antes do decreto), pagamento em jan/2024.
  const j = calcularJuros(1000, "2023-10-10", "2024-01-15", {
    ...SELIC, "2023-11": 0.9, "2023-12": 0.9,
  });
  assert.deepEqual(j.meses.map((m) => m.competencia), ["2023-11", "2023-12"]);
  // 0.9 + 0.9 + 1 (fração do pagamento) + 1 (fração do vencimento)
  assert.equal(j.percentual, 3.8);
});

test("na regra antiga, vencer no último dia do mês não gera fração", () => {
  const j = calcularJuros(1000, "2023-10-31", "2024-01-15", SELIC);
  // Sem o +1% do mês do vencimento: 0.9 + 0.9 + 1
  assert.equal(j.percentual, 2.8);
});

test("mês sem Selic publicada é reportado, não estimado", () => {
  const j = calcularJuros(1000, "2026-06-20", "2026-09-15", { "2026-07": 1.0 });
  assert.deepEqual(j.faltando, ["2026-08"]);
});

test("sem atraso não há juros", () => {
  const j = calcularJuros(1000, "2026-09-10", "2026-09-10", SELIC);
  assert.equal(j.valor, 0);
  assert.equal(j.percentual, 0);
});

test("a memória de cálculo diz de onde veio cada parcela", () => {
  const j = calcularJuros(1000, "2026-06-20", "2026-09-15", SELIC);
  assert.ok(j.memoria.includes("2026-07"));
  assert.ok(j.memoria.includes("fração do mês do pagamento"));
});

// ------------------------------------------------------- arredondamento

test("arredonda o centavo para cima", () => {
  // Arredondar para baixo deixaria resíduo de débito em aberto.
  assert.equal(arredondar(64.551), 64.56);
  assert.equal(arredondar(64.5500001), 64.56);
  assert.equal(arredondar(10), 10, "valor exato não sobe");
});

test("arredondar valor inválido não quebra", () => {
  assert.equal(arredondar(NaN), 0);
  assert.equal(arredondar(Infinity), 0);
});

// ------------------------------------------------------------ receita

test("46-2 muda de receita conforme o regime", () => {
  assert.equal(receitaSugerida("46-2", "simples")!.codigoServico, 4602);
  assert.equal(receitaSugerida("46-2", "rpa")!.codigoServico, 4601);
});

test("substituição tributária tem receita própria", () => {
  assert.equal(receitaSugerida("146-2", "simples")!.codigoServico, 14602);
  assert.equal(receitaSugerida("146-3", "simples")!.codigoServico, 14602);
  assert.equal(receitaSugerida("146-2", "rpa")!.codigoServico, 14601);
});

test("46-1 é sempre operações próprias", () => {
  assert.equal(receitaSugerida("46-1", "rpa")!.codigoServico, 4601);
  assert.equal(receitaSugerida("46-1", "simples")!.codigoServico, 4601);
});

test("código desconhecido não inventa receita", () => {
  assert.equal(receitaSugerida("99-9", "simples"), null);
  assert.equal(receitaSugerida("", "rpa"), null);
});

// --------------------------------------------------------------- guia

test("a guia soma imposto, multa e juros", () => {
  const g = montarGuia(1000, "2026-06-20", "2026-09-15", SELIC);
  assert.equal(g.principal, 1000);
  assert.equal(g.multa.valor, 100);
  assert.equal(g.juros.valor, 30);
  assert.equal(g.total, 1130);
  assert.equal(g.incompleta, false);
  assert.equal(g.impedimento, null);
});

test("débito anterior a nov/2017 não é calculado", () => {
  const g = montarGuia(1000, "2017-10-20", "2026-09-15", SELIC);
  assert.equal(g.incompleta, true);
  assert.ok(g.impedimento!.includes("UFESP"));
});

test("Selic faltando impede a guia e diz qual mês", () => {
  const g = montarGuia(1000, "2026-06-20", "2026-09-15", { "2026-07": 1.0 });
  assert.equal(g.incompleta, true);
  assert.ok(g.impedimento!.includes("2026-08"));
  assert.equal(g.multa.valor, 100, "a multa continua visível");
});

test("pagamento em dia: guia é só o imposto", () => {
  const g = montarGuia(1000, "2026-09-10", "2026-09-10", SELIC);
  assert.equal(g.total, 1000);
  assert.equal(g.incompleta, false);
});

test("data inválida não passa em silêncio", () => {
  assert.ok(montarGuia(1000, "20/06/2026", "2026-09-15", SELIC).impedimento);
  assert.ok(montarGuia(1000, "2026-06-20", "", SELIC).impedimento);
});
