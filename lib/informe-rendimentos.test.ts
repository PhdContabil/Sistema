// node --experimental-strip-types --test lib/informe-rendimentos.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  regimeDeDescricao, tributo, montarPlano, ultimoDiaDoMes, validarEntrada, InformeInvalido,
  type EntradaInforme,
} from "./informe-rendimentos.ts";

const base: EntradaInforme = {
  tipo: "rendimentos", codigoempresa: 1415, competencia: "2026-08",
  rendimento: 10.85, demaisReceitas: 0, dividendos: 0, retencao: 0,
};

test("regime: lê a descrição do Tareffa", () => {
  assert.equal(regimeDeDescricao("Lucro Real"), "real");
  assert.equal(regimeDeDescricao(" LUCRO  PRESUMIDO "), "presumido");
  assert.equal(regimeDeDescricao("Simples Nacional"), null);
  assert.equal(regimeDeDescricao("MEI"), null);
  assert.equal(regimeDeDescricao("Imune/Isento"), null);
  assert.equal(regimeDeDescricao(null), null);
});

test("tributo: bate com a tela do Questor (base 10,85)", () => {
  assert.equal(tributo(10.85, 0.65), 0.07);
  assert.equal(tributo(10.85, 4), 0.43);
});

test("tributo: arredonda ao centavo sem erro de ponto flutuante", () => {
  assert.equal(tributo(100, 0.65), 0.65);
  assert.equal(tributo(1000.5, 4), 40.02);
  assert.equal(tributo(0.01, 4), 0);
});

test("últimos dias do mês", () => {
  assert.equal(ultimoDiaDoMes("2026-02"), "2026-02-28");
  assert.equal(ultimoDiaDoMes("2028-02"), "2028-02-29");
  assert.equal(ultimoDiaDoMes("2026-08"), "2026-08-31");
});

test("Presumido: F100 sem incidência (CST 8), conta 2859, como o Access", () => {
  const p = montarPlano(base, "presumido");
  assert.equal(p.ecf.length, 1);
  assert.equal(p.ecf[0].codigooperacaofis, 45040);
  assert.equal(p.ecf[0].datalctofis, "2026-08-01");
  assert.equal(p.f100.length, 1);
  const f = p.f100[0];
  assert.equal(f.cst, 8);
  assert.equal(f.cstcofins, 8);
  assert.equal(f.valorpis, 0);
  assert.equal(f.valorcofins, 0);
  assert.equal(f.tipodebito, "4.3.15.999");
  assert.equal(f.compensacred, 0);
  assert.equal(f.contactb, 2859);
  assert.equal(f.datalctofis, "2026-08-31");
  assert.deepEqual(p.totais, { pis: 0, cofins: 0, base: 0 });
});

test("Real: F100 tributável (CST 2, 0,65% e 4%), débito 4.3.05.02, conta 2659", () => {
  const p = montarPlano(base, "real");
  const f = p.f100[0];
  assert.equal(f.cst, 2);
  assert.equal(f.cstcofins, 2);
  assert.equal(f.aliqpis, 0.65);
  assert.equal(f.aliqcofins, 4);
  assert.equal(f.valorpis, 0.07);
  assert.equal(f.valorcofins, 0.43);
  assert.equal(f.basecalculo, 10.85);
  assert.equal(f.tipodebito, "4.3.05.02");
  assert.equal(f.tipodebitocofins, "4.3.05.02");
  assert.equal(f.compensacred, 1);
  assert.equal(f.contactb, 2659);
  assert.deepEqual(p.totais, { pis: 0.07, cofins: 0.43, base: 10.85 });
  assert.ok(p.avisos.some((a) => a.includes("45040")), "avisa que os códigos da ECF não foram confirmados");
});

test("dividendos e retenção: iguais nos dois regimes", () => {
  const e = { ...base, rendimento: 0, dividendos: 500, retencao: 12.34 };
  for (const r of ["presumido", "real"] as const) {
    const p = montarPlano(e, r);
    assert.equal(p.f100.length, 1);
    assert.equal(p.f100[0].contactb, 2893);
    assert.equal(p.f100[0].cst, 8);
    assert.equal(p.ecf.length, 1);
    assert.equal(p.ecf[0].codigooperacaofis, 45118);
    assert.equal(p.ecf[0].valoroutraoperacaofis, 12.34);
  }
});

test("demais receitas: só ECF 45058", () => {
  const p = montarPlano({ ...base, rendimento: 0, demaisReceitas: 80 }, "presumido");
  assert.equal(p.f100.length, 0);
  assert.equal(p.ecf[0].codigooperacaofis, 45058);
});

test("validação", () => {
  assert.throws(() => validarEntrada({ ...base, codigoempresa: 9001 }), InformeInvalido);
  assert.throws(() => validarEntrada({ ...base, competencia: "2026-13" }), InformeInvalido);
  assert.throws(() => validarEntrada({ ...base, competencia: "2099-01" }), InformeInvalido);
  assert.throws(() => validarEntrada({ ...base, rendimento: -1 }), InformeInvalido);
  assert.throws(() => validarEntrada({ ...base, rendimento: Number.NaN }), InformeInvalido);
  assert.throws(() => validarEntrada({ ...base, rendimento: 0 }), InformeInvalido);
});

test("ganho de capital: só demais receitas (ECF 45058), sem F100, nos dois regimes", () => {
  const e: EntradaInforme = { ...base, tipo: "ganho-capital", rendimento: 99, dividendos: 99, retencao: 99, demaisReceitas: 1500 };
  for (const r of ["presumido", "real"] as const) {
    const p = montarPlano(e, r);
    assert.equal(p.f100.length, 0);
    assert.equal(p.ecf.length, 1);
    assert.equal(p.ecf[0].codigooperacaofis, 45058);
    assert.equal(p.ecf[0].valoroutraoperacaofis, 1500);
  }
});

test("ganho de capital: exige valor", () => {
  assert.throws(() => montarPlano({ ...base, tipo: "ganho-capital", rendimento: 10, demaisReceitas: 0 }, "presumido"), InformeInvalido);
});

test("aluguéis no Presumido: igual ao rendimento do Access (CST 8, conta 2859)", () => {
  const p = montarPlano({ ...base, tipo: "alugueis" }, "presumido");
  assert.equal(p.tipo, "alugueis");
  assert.equal(p.ecf[0].codigooperacaofis, 45040);
  assert.equal(p.f100[0].cst, 8);
  assert.equal(p.f100[0].contactb, 2859);
});

test("aluguéis no Real: recusa (regra não definida)", () => {
  assert.throws(() => montarPlano({ ...base, tipo: "alugueis" }, "real"), InformeInvalido);
});

test("tipo inválido", () => {
  assert.throws(() => validarEntrada({ ...base, tipo: "outro" as never }), InformeInvalido);
});
