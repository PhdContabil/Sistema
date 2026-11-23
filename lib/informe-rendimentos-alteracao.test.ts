import { test } from "node:test";
import assert from "node:assert/strict";
import {
  linhasDaResposta, chaveAlterar, chaveExcluir, corpoExcluir, corpoAlterar, mesmosValores, ehStatusAtivo,
} from "./informe-rendimentos-alteracao.ts";
import { montarPlano, type EntradaInforme } from "./informe-rendimentos.ts";

const lancamento = {
  ok: true,
  ecf: [
    { seq: 1, operacao: 1, codigoempresa: 835, codigooperacaofis: 45040, valoroutraoperacaofis: 4.35 },
    { seq: 1, operacao: 1, codigoempresa: 835, codigooperacaofis: 45118, valoroutraoperacaofis: 0.95 },
  ],
  f100: [{ seq: 133, valoroper: 4.35, cst: 8 }],
  avisos: [],
};
const entrada: EntradaInforme = { tipo: "rendimentos", codigoempresa: 835, competencia: "2026-10", rendimento: 4.35, demaisReceitas: 0, dividendos: 0, retencao: 0.95 };

test("linhasDaResposta lê seq e valores do lançamento", () => {
  assert.deepEqual(linhasDaResposta(lancamento), {
    ecf: [
      { codigooperacaofis: 45040, seq: 1, valoroutraoperacaofis: 4.35 },
      { codigooperacaofis: 45118, seq: 1, valoroutraoperacaofis: 0.95 },
    ],
    f100: [{ seq: 133, valoroper: 4.35 }],
  });
});

test("linhasDaResposta ignora linhas excluídas e devolve null sem linhas", () => {
  const l = linhasDaResposta({ ecf: [
    { acao: "atualizada", codigooperacaofis: 45040, seq: 1, valoroutraoperacaofis: 5 },
    { acao: "excluida", codigooperacaofis: 45118, seq: 1, valoroutraoperacaofis: 1 },
  ], f100: [{ acao: "excluida", seq: 9, valoroper: 5 }] });
  assert.equal(l?.ecf.length, 1);
  assert.equal(l?.f100.length, 0);
  assert.equal(linhasDaResposta({ ok: true }), null);
  assert.equal(linhasDaResposta(null), null);
  assert.equal(linhasDaResposta({ ecf: [], f100: [] }), null);
});

test("chaves têm o prefixo da API e mudam com o lançamento de origem e os valores", () => {
  const a = chaveAlterar(10, entrada, "presumido");
  assert.match(a, /^informe-alterar:835:2026-10:[0-9a-f]{20}$/);
  assert.equal(a, chaveAlterar(10, entrada, "presumido"));
  assert.notEqual(a, chaveAlterar(11, entrada, "presumido"));
  assert.notEqual(a, chaveAlterar(10, { ...entrada, rendimento: 5 }, "presumido"));
  const x = chaveExcluir(10, 835, "2026-10");
  assert.match(x, /^informe-excluir:835:2026-10:[0-9a-f]{20}$/);
  assert.notEqual(x, chaveExcluir(11, 835, "2026-10"));
});

test("corpoExcluir e corpoAlterar seguem o formato combinado com a TI", () => {
  const atual = linhasDaResposta(lancamento)!;
  assert.deepEqual(corpoExcluir({ usuario: "a@b", competencia: "2026-10", tipo: "rendimentos" }, atual),
    { usuario: "a@b", competencia: "2026-10", tipo: "rendimentos", ecf: atual.ecf, f100: atual.f100 });
  const plano = montarPlano({ ...entrada, rendimento: 1200, retencao: 5 }, "presumido");
  const c = corpoAlterar({ usuario: "a@b", competencia: "2026-10", tipo: "rendimentos", regime: "presumido" }, atual, plano);
  assert.deepEqual(c.atual, atual);
  assert.equal(c.regime, "presumido");
  assert.equal(c.novo.ecf.length, plano.ecf.length);
  assert.ok(c.novo.ecf.every((l) => !("rotulo" in l) && !("seq" in l)));
  assert.ok(c.novo.f100.every((l) => !("rotulo" in l)));
});

test("mesmosValores compara em centavos", () => {
  const l = { rendimento: 4.35, demais_receitas: 0, dividendos: 0, retencao: 0.95 };
  assert.equal(mesmosValores(l, entrada), true);
  assert.equal(mesmosValores(l, { ...entrada, retencao: 0.96 }), false);
  assert.equal(mesmosValores({ ...l, rendimento: 4.3500000001 }, entrada), true);
});

test("só lançado e alterado são ativos", () => {
  assert.equal(ehStatusAtivo("lancado"), true);
  assert.equal(ehStatusAtivo("alterado"), true);
  for (const s of ["erro", "excluido", "excluido_depois", "alterado_depois"]) assert.equal(ehStatusAtivo(s), false);
});
