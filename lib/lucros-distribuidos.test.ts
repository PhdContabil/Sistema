import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LucroInvalido, montarAjuste, montarPlano, sugerirIrrf, ultimoDiaDoMes, type EntradaLucro,
} from "./lucros-distribuidos.ts";

const base: EntradaLucro = {
  codigoempresa: 1415, codigosocio: 2, competencia: "2026-03", dataPagamento: "2026-03-15",
  rendimento: 10000, baseIrrf: 0, imposto: 0, tisencao: 1,
};

test("sugerirIrrf: até R$ 50.000 não retém", () => {
  assert.deepEqual(sugerirIrrf(50000, "2026-03"), { base: 0, imposto: 0 });
});

test("sugerirIrrf: acima de R$ 50.000 em 2026 retém 10% sobre o total", () => {
  assert.deepEqual(sugerirIrrf(60000, "2026-01"), { base: 60000, imposto: 6000 });
  assert.deepEqual(sugerirIrrf(50000.01, "2026-12"), { base: 50000.01, imposto: 5000 });
});

test("sugerirIrrf: competência anterior a 2026 não retém", () => {
  assert.deepEqual(sugerirIrrf(900000, "2025-12"), { base: 0, imposto: 0 });
});

test("ultimoDiaDoMes", () => {
  assert.equal(ultimoDiaDoMes("2026-02-10"), "2026-02-28");
  assert.equal(ultimoDiaDoMes("2028-02-01"), "2028-02-29");
  assert.equal(ultimoDiaDoMes("2026-12-31"), "2026-12-31");
});

test("plano sem imposto: sem colunas de IRRF e base zero", () => {
  const p = montarPlano(base);
  assert.equal(p.fiscal.competencia, "2026-03-01");
  assert.equal(p.fiscal.datalctofis, "2026-03-31");
  assert.equal(p.fiscal.codigonaturezarendimento, 12001);
  assert.equal(p.fiscal.basecalcirrf, 0);
  assert.equal(p.fiscal.aliquota, null);
  assert.equal(p.fiscal.codigoimposto, null);
  assert.equal(p.fiscal.tipoisencao, 1);
  assert.equal(p.fiscal.valorisencao, 0);
  assert.equal(p.liquido, 10000);
});

test("plano com imposto: base, alíquota 10, código 1841", () => {
  const p = montarPlano({ ...base, rendimento: 60000, baseIrrf: 60000, imposto: 6000 });
  assert.equal(p.fiscal.basecalcirrf, 60000);
  assert.equal(p.fiscal.aliquota, 10);
  assert.equal(p.fiscal.valorimposto, 6000);
  assert.equal(p.fiscal.codigoimposto, 1841);
  assert.equal(p.fiscal.variacaoimposto, 1);
  assert.equal(p.liquido, 54000);
});

test("isenção 12: valor isento é o rendimento todo", () => {
  const p = montarPlano({ ...base, tisencao: 12 });
  assert.equal(p.fiscal.valorisencao, 10000);
});

test("linha da DP: descrição com o ano da competência, código 561", () => {
  const p = montarPlano({ ...base, competencia: "2026-01", dataPagamento: "2026-02-20" });
  assert.equal(p.dp.descricaorendimento, "Distribuição de lucros de 2026");
  assert.equal(p.dp.datapgto, "2026-02-28");
  assert.equal(p.dp.codigoimposto, 561);
  assert.equal(p.dp.variacaoimposto, 2);
  assert.equal(p.dp.tipo, 2);
  assert.equal(p.dp.valorirrf, 0);
});

test("não existe campo de observação no plano", () => {
  const p = montarPlano(base);
  assert.equal("desccomplementar" in p.fiscal, false);
  assert.equal("observacao" in p.entrada, false);
});

test("validação", () => {
  assert.throws(() => montarPlano({ ...base, rendimento: 0 }), LucroInvalido);
  assert.throws(() => montarPlano({ ...base, codigosocio: 0 }), LucroInvalido);
  assert.throws(() => montarPlano({ ...base, competencia: "2026-13" }), LucroInvalido);
  assert.throws(() => montarPlano({ ...base, dataPagamento: "2026-02-30" }), LucroInvalido);
  assert.throws(() => montarPlano({ ...base, imposto: 20000 }), LucroInvalido);
  assert.throws(() => montarPlano({ ...base, imposto: 100, baseIrrf: 0 }), LucroInvalido);
  assert.throws(() => montarPlano({ ...base, tisencao: 0 }), LucroInvalido);
});

test("ajuste: novos valores e data da DP", () => {
  const a = montarAjuste({
    ...base, rendimento: 70000, baseIrrf: 70000, imposto: 7000, dataPagamento: "2026-04-10",
    chave: 33, dataAtual: "2026-03-31",
  });
  assert.equal(a.fiscal.valorrendpago, 70000);
  assert.equal(a.fiscal.datalctofis, "2026-04-30");
  assert.equal(a.dp.datapgto, "2026-04-30");
  assert.equal(a.dp.valorrendimento, 70000);
  assert.equal(a.liquido, 63000);
});

test("ajuste exige a chave e a data atual", () => {
  assert.throws(() => montarAjuste({ ...base, chave: 0, dataAtual: "2026-03-31" }), LucroInvalido);
  assert.throws(() => montarAjuste({ ...base, chave: 1, dataAtual: "x" }), LucroInvalido);
});
