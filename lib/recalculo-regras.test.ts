import { test } from "node:test";
import assert from "node:assert/strict";
import { extrairDebitos, montarPedido, servicoDoDebito, aaaamm } from "./recalculo-regras.ts";

const A = "Pendência - Débito (SIEF) ____ CNPJ: 22.410.788/0001-47 Receita PA/Exerc. Dt. Vcto Vl. Original Sdo. Devedor Multa Juros Sdo. Dev. Cons. 8109-02 - PIS 01/2024 23/02/2024 189,04 189,04 37,80 64,63 291,47 Situação: EM NEGOCIACAO DE PARCELAMENTO 8109-02 - PIS 02/2024 25/03/2024 146,79 146,79 29,35 48,96 225,10 Situação: EM NEGOCIACAO DE PARCELAMENTO Página: 1 / MINISTÉRIO DA ECONOMIA CNPJ: 22.410.788 - BS MAGALHAES EVENTOS LTDA 8109-02 - PIS 03/2024 25/04/2024 21,67 21,67 4,33 7,03 33,03 Situação: EM NEGOCIACAO DE PARCELAMENTO __________________________ Diagnóstico Fiscal na Procuradoria-Geral da Fazenda Nacional ___ Pendência - Inscrição (SIDA) 80.4.21.029741-00 1507-SIMPLES NACIONAL 15/03/2021";
const B = "Pendência - Débito (SIEF) ____ CNPJ: 39.149.797/0001-29 Receita PA/Exerc. Dt. Vcto Vl. Original Sdo. Devedor Multa Juros Sdo. Dev. Cons. Situação SIMPLES NAC. 09/2026 20/10/2026 7.982,01 7.982,01 763,87 79,82 8.825,70 DEVEDOR Página: 1 / MINISTÉRIO Débito com Exigibilidade Suspensa (SIEF) ____ 1082-01 - CP-SEGUR. 10/2026 19/11/2026 1.348,33 1.348,33 A ANALISAR-A VENCER";

test("lê débitos do SIEF com quebra de página", () => {
  const d = extrairDebitos(A);
  assert.equal(d.length, 3);
  assert.deepEqual([d[0].codigo, d[0].extensao, d[0].periodo, d[0].vencimento, d[0].saldo_consolidado], ["8109", "02", "01/2024", "2024-02-23", 291.47]);
  assert.equal(d[0].situacao, "EM NEGOCIACAO DE PARCELAMENTO");
  assert.equal(d[2].valor_original, 21.67);
  assert.equal(d[0].servico, "sicalc");
});

test("Simples vira DAS e ignora exigibilidade suspensa", () => {
  const d = extrairDebitos(B);
  assert.equal(d.length, 1);
  assert.equal(d[0].servico, "das");
  assert.equal(d[0].saldo_devedor, 7982.01);
  assert.equal(d[0].situacao, "DEVEDOR");
});

test("serviço por receita", () => {
  assert.equal(servicoDoDebito("1082-01 - CP-SEGUR."), "dctfweb");
  assert.equal(servicoDoDebito("SIMPLES NAC. - MEI"), "das_mei");
});

test("montagem dos pedidos", () => {
  assert.equal(aaaamm("10/2026"), "202610");
  const das = montarPedido({ servico: "das", periodo: "10/2026", dataPagamento: "2026-11-24" }, "2026-11-24");
  assert.deepEqual(das.dados, { periodoApuracao: "202610" }); // hoje: sem dataConsolidacao
  const dasF = montarPedido({ servico: "das", periodo: "10/2026", dataPagamento: "2026-11-28" }, "2026-11-24");
  assert.deepEqual(dasF.dados, { periodoApuracao: "202610", dataConsolidacao: "20261128" });
  const dw = montarPedido({ servico: "dctfweb", periodo: "10/2026", dataPagamento: "2026-11-25" }, "2026-11-24");
  assert.equal((dw.dados as Record<string, unknown>).DataAcolhimentoProposta, 20261125);
  assert.throws(() => montarPedido({ servico: "dctfweb", periodo: "10/2026", dataPagamento: "2026-12-01" }, "2026-11-24"));
  assert.throws(() => montarPedido({ servico: "das", periodo: "10/2026", dataPagamento: "2026-11-23" }, "2026-11-24"));
  const s = montarPedido({ servico: "sicalc", periodo: "01/2024", dataPagamento: "2026-11-24", codigo: "8109", extensao: "02", vencimento: "2024-02-23", valor: 189.04 }, "2026-11-24");
  assert.equal(s.idSistema, "SICALC");
  assert.equal((s.dados as Record<string, unknown>).valorImposto, "189.04");
});

test("trimestral, MAED e período em data", () => {
  const d = extrairDebitos("Pendência - Débito (SIEF) ___ Situação 2089-01 - IRPJ 4º TRIM/2025 30/01/2026 4.373,72 4.373,72 874,74 337,21 5.585,67 DEVEDOR 2203-01 - MAED EFD-CONTR 16/03/2026 17/04/2026 297,70 297,70 0,00 13,12 310,82 DEVEDOR Notificação de lançamento: 94107 ___ Diagnóstico Fiscal na Procuradoria");
  assert.equal(d.length, 2);
  assert.equal(d[0].tipo_periodo, "TR");
  assert.equal(aaaamm(d[0].periodo), "202512");
  assert.equal(d[1].servico, "sem_guia");
  assert.equal(d[1].tipo_periodo, "DI");
});
