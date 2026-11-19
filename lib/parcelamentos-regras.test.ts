import { test } from "node:test";
import assert from "node:assert/strict";
import { compAtual, extrairAtivos, fmtComp, fmtDataInt, nomeArquivo, pdfDoDas } from "./parcelamentos-regras.ts";

test("extrairAtivos pega só 'Em parcelamento' de todas as modalidades", () => {
  const r = extrairAtivos([
    { modalidade: "PARCSN", dados: { parcelamentos: [{ numero: 1, situacao: "Encerrado por liquidação" }, { numero: 2, situacao: "Em Parcelamento" }] } },
    { modalidade: "PERTSN", dados: null },
    { modalidade: "RELPSN", dados: { parcelamentos: [{ numero: 9, situacao: "em parcelamento" }] } },
  ]);
  assert.deepEqual(r.map((x) => `${x.modalidade}:${x.numero}`), ["PARCSN:2", "RELPSN:9"]);
});

test("formatos", () => {
  assert.equal(fmtComp(202410), "10/2024");
  assert.equal(fmtDataInt(20240220), "20/02/2024");
  assert.equal(fmtDataInt(null), "—");
  assert.equal(compAtual(new Date("2026-11-18T12:00:00Z")), 202611);
});

test("pdfDoDas lê os nomes alternativos", () => {
  const b = "x".repeat(200);
  assert.equal(pdfDoDas({ PDFByteArrayBase64: b }), b);
  assert.equal(pdfDoDas([{ docArrecadacaoPdfB64: b }]), b);
  assert.equal(pdfDoDas({ pdf: "curto" }), null);
});

test("nomeArquivo", () => {
  assert.equal(nomeArquivo("JOSÉ & CIA LTDA.", "1", "PERTSN", 202611, 9101), "JOSE_CIA_LTDA_PERTSN_9101_202611.pdf");
});
