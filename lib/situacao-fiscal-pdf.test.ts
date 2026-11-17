// node --experimental-strip-types --test lib/situacao-fiscal-pdf.test.ts
//
// Regra de classificação do SITFIS sobre trechos de texto como o relatório
// traz. A extração do PDF é exercida pelo "Reclassificar" sobre os PDFs reais.
import test from "node:test";
import assert from "node:assert/strict";
import { blocosDePendencia, classificarTexto, extrairCertidao, extrairSimplesNacional } from "./situacao-fiscal-pdf.ts";

const HOJE = "2026-11-16";
const CAB = "Relatório de Situação Fiscal CNPJ 00.000.000/0001-00 ";

test("regular: frase de 'não foram detectadas' não vira bloco", () => {
  const txt = CAB + "Diagnóstico Fiscal Não foram detectadas pendências/exigibilidades suspensas nos controles da Receita Federal.";
  const c = classificarTexto(txt, HOJE);
  assert.equal(c.situacao, "regular");
  assert.equal(c.pendencias, 0);
});

test("irregular: Pendência - Débito (SIEF)", () => {
  const txt = CAB + "Diagnóstico Fiscal Pendência - Débito (SIEF) Receita 1082 PA 03/2026 saldo devedor 120,00";
  const c = classificarTexto(txt, HOJE);
  assert.equal(c.situacao, "irregular");
  assert.match(c.resumo, /débito/);
});

test("com restrição: só parcelamento com exigibilidade suspensa", () => {
  const txt = CAB + "Diagnóstico Fiscal Parcelamento com Exigibilidade Suspensa (PARCSN) Parcelas em atraso 0";
  const c = classificarTexto(txt, HOJE);
  assert.equal(c.situacao, "com_restricao");
});

test("parcelamento sem 'suspensa' com parcela em atraso é exigível", () => {
  const b = blocosDePendencia("Diagnóstico Fiscal Pendência - Parcelamento (PARCSN) Parcelas em atraso 2");
  assert.deepEqual(b, [{ classe: "exigivel", rotulo: "parcelamento com 2 parcela(s) em atraso" }]);
});

test("misto: exigível vence suspenso", () => {
  const txt = CAB + "Diagnóstico Fiscal Inscrição com Exigibilidade Suspensa (SIDA) xx Pendência - Omissão (GFIP) yy";
  assert.equal(classificarTexto(txt, HOJE).situacao, "irregular");
});

test("Simples: vale o último período; exclusão futura ainda é optante; SIMEI não contamina", () => {
  const txt = "Opção pelo Simples Nacional Inclusão Exclusão 01/01/2015 31/12/2018 01/01/2020 31/12/2026 "
    + "Opção pelo SIMEI Inclusão 01/07/2010 Sócios";
  const s = extrairSimplesNacional(txt, HOJE);
  assert.equal(s.simples_opcao, true);
  assert.equal(s.simples_inclusao, "2020-01-01");
  assert.equal(s.simples_exclusao, "2026-12-31");
  assert.equal(s.simples_periodos?.length, 2);
  assert.equal(s.simei_opcao, true);
  assert.equal(s.simei_inclusao, "2010-07-01");
});

test("Simples: exclusão passada = não optante", () => {
  const s = extrairSimplesNacional("Opção pelo Simples Nacional 01/01/2015 31/12/2018 Sócios", HOJE);
  assert.equal(s.simples_opcao, false);
});

test("certidão: tipo e validade", () => {
  const c = extrairCertidao("Certidão Emitida Positiva com Efeitos de Negativa Data de Validade: 10/03/2027");
  assert.deepEqual(c, { certidao_tipo: "Positiva com efeitos de negativa", certidao_validade: "2027-03-10" });
});
