// Testes da regra F/R/I. Rodar com:
//   node --experimental-strip-types --test lib/contabil.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { flagsDoMes, montarLinhas, contarPendencias, type MesConsolidacao } from "./contabil.ts";

function mes(p: Partial<MesConsolidacao>): MesConsolidacao {
  return {
    mes: 1,
    folha_mov_valor: 0, folha_mov_qtd: 0,
    folha_ctb_valor: 0, folha_ctb_qtd: 0,
    receita_fis_valor: 0, receita_fis_qtd: 0,
    receita_ctb_valor: 0, receita_ctb_qtd: 0,
    imposto_ctb_valor: 0, imposto_ctb_qtd: 0,
    ...p,
  };
}

test("sem movimento nenhum não gera pendência", () => {
  assert.deepEqual(flagsDoMes(mes({})), []);
});

test("folha lançada e contabilizada não gera F", () => {
  const m = mes({ folha_mov_qtd: 10, folha_mov_valor: 5000, folha_ctb_qtd: 3, folha_ctb_valor: 5000 });
  assert.deepEqual(flagsDoMes(m), []);
});

test("folha lançada e não contabilizada gera F", () => {
  const m = mes({ folha_mov_qtd: 10, folha_mov_valor: 5000 });
  assert.deepEqual(flagsDoMes(m), ["F"]);
});

test("saída sem receita nem imposto contabilizados gera R e I", () => {
  const m = mes({ receita_fis_qtd: 20, receita_fis_valor: 90000 });
  assert.deepEqual(flagsDoMes(m), ["R", "I"]);
});

test("saída com receita contabilizada mas sem imposto gera só I", () => {
  const m = mes({
    receita_fis_qtd: 20, receita_fis_valor: 90000,
    receita_ctb_qtd: 4, receita_ctb_valor: 90000,
  });
  assert.deepEqual(flagsDoMes(m), ["I"]);
});

test("os três grupos pendentes saem na ordem F, R, I", () => {
  const m = mes({ folha_mov_qtd: 1, receita_fis_qtd: 1 });
  assert.deepEqual(flagsDoMes(m), ["F", "R", "I"]);
});

// Este é o caso que o Power BI erra: no DAX `0 = BLANK()` é verdadeiro, então
// um movimento que soma exatamente zero era lido como "não houve movimento".
// Caso real observado no modelo: empresa 1194.
test("movimento com valor zero mas com lançamentos ainda conta como movimento", () => {
  const m = mes({ receita_fis_qtd: 2, receita_fis_valor: 0 });
  assert.deepEqual(flagsDoMes(m), ["R", "I"], "qtd > 0 com valor 0 precisa gerar pendência");
});

test("valor alto sem nenhum lançamento não conta como movimento", () => {
  // qtd zero significa que não existe lançamento, independente do valor
  const m = mes({ receita_fis_qtd: 0, receita_fis_valor: 999999 });
  assert.deepEqual(flagsDoMes(m), []);
});

test("montarLinhas distribui os meses no índice certo e marca os sem dado", () => {
  const [linha] = montarLinhas([
    {
      codigoempresa: 1194, nome: "TESTE LTDA", cnpj: null,
      meses: [
        mes({ mes: 3, folha_mov_qtd: 5 }),
        mes({ mes: 8, receita_fis_qtd: 2, receita_fis_valor: 0 }),
      ],
    },
  ]);

  assert.equal(linha.meses.length, 12);
  assert.deepEqual(linha.meses[2], ["F"]);
  assert.deepEqual(linha.meses[7], ["R", "I"]);
  assert.deepEqual(linha.meses[0], []);
  assert.equal(linha.comDados[2], true);
  assert.equal(linha.comDados[0], false, "mês omitido pela API fica sem dado");
  assert.equal(linha.totalPendencias, 3);
});

test("contarPendencias soma por tipo e conta empresas afetadas", () => {
  const linhas = montarLinhas([
    { codigoempresa: 1, nome: "A", cnpj: null, meses: [mes({ mes: 1, folha_mov_qtd: 1 })] },
    { codigoempresa: 2, nome: "B", cnpj: null, meses: [mes({ mes: 1, receita_fis_qtd: 1 })] },
    { codigoempresa: 3, nome: "C", cnpj: null, meses: [mes({ mes: 1, folha_mov_qtd: 1, folha_ctb_qtd: 1 })] },
  ]);
  const c = contarPendencias(linhas);
  assert.equal(c.F, 1);
  assert.equal(c.R, 1);
  assert.equal(c.I, 1);
  assert.equal(c.total, 3);
  assert.equal(c.empresas, 2, "a empresa sem pendência não entra na contagem");
});
