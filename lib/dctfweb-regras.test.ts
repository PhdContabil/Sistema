// node --experimental-strip-types --test lib/dctfweb-regras.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  agoraBrasilia, divergente, ehJaTransmitida, motivoBloqueio, motivoSemGuia, origemDoXml,
  situacaoDasMensagens, transmissaoComSucesso, valorDoXml, xmlDosDados,
} from "./dctfweb-regras.ts";

const XML = `<ProcDctf><ConteudoDeclaracao id="ID1">
  <x><sistemaUsuarioDctf>7</sistemaUsuarioDctf><saldoaPagar>100,50</saldoaPagar></x>
  <x><sistemaUsuarioDctf>1</sistemaUsuarioDctf><saldoaPagar>20.25</saldoaPagar></x>
  <x><sistemaUsuarioDctf>1</sistemaUsuarioDctf></x>
</ConteudoDeclaracao></ProcDctf>`;

test("origem e valor do XML", () => {
  assert.equal(origemDoXml(XML), "eSocial, REINF RET");
  assert.equal(valorDoXml(XML), 120.75);
  assert.equal(origemDoXml("<a/>"), null);
  assert.equal(valorDoXml(null), null);
});

test("xmlDosDados decodifica base64", () => {
  assert.equal(xmlDosDados({ XMLStringBase64: Buffer.from("<ok/>").toString("base64") }), "<ok/>");
  assert.equal(xmlDosDados({}), null);
});

test("situação pelas mensagens", () => {
  assert.equal(situacaoDasMensagens(200, [{ texto: "Declaração em andamento" }]), "em_andamento");
  // 200 sozinho não prova transmissão (caso Fernando Santos 09/2026)
  assert.equal(situacaoDasMensagens(200, []), "pendente");
  assert.equal(situacaoDasMensagens(200, [], ""), "pendente");
  assert.equal(situacaoDasMensagens(200, [], "{}"), "pendente");
  assert.equal(situacaoDasMensagens(200, [{ codigo: "[Aviso-DCTFWEB-MG08]", texto: "Não foi encontrada declaração para o período" }], "{\"PDFByteArrayBase64\":\"JVBERi0xLjQ=\"}"), "pendente");
  assert.equal(situacaoDasMensagens(200, [{ codigo: "[Sucesso-DCTFWEB]", texto: "Requisição efetuada com sucesso." }], "{\"PDFByteArrayBase64\":\"JVBERi0xLjQgZGVjbGFyYWNhbw==\"}"), "transmitida");
  assert.equal(situacaoDasMensagens(200, [], "{\"PDFByteArrayBase64\":null}"), "pendente");
  assert.equal(situacaoDasMensagens(404, [{ texto: "não encontrada" }]), "pendente");
});

test("transmissão: sucesso e já transmitida", () => {
  assert.equal(transmissaoComSucesso(200, [{ codigo: "[Sucesso-DCTFWEB]" }]), true);
  assert.equal(transmissaoComSucesso(200, [{ codigo: "Aviso" }]), false);
  assert.equal(transmissaoComSucesso(400, [{ codigo: "Sucesso" }]), false);
  assert.equal(ehJaTransmitida([{ codigo: "TRANS11_Declaracao_Ja_Transmitida" }]), true);
  assert.equal(ehJaTransmitida([{ texto: "outro erro" }]), false);
});

test("bloqueios da transmissão", () => {
  assert.equal(motivoBloqueio({ situacao: "transmitida", nao_transmitir: false, debito: 10 }), "já transmitida");
  assert.equal(motivoBloqueio({ situacao: "pendente", nao_transmitir: true, debito: 10 }), "trava manual");
  assert.equal(motivoBloqueio({ situacao: "pendente", nao_transmitir: false, debito: 0 }), "sem débito apurado");
  assert.equal(motivoBloqueio({ situacao: "em_andamento", nao_transmitir: false, debito: "12.3" }), null);
});

test("divergência com tolerância de 5%", () => {
  assert.equal(divergente(1000, 960), false);
  assert.equal(divergente(1000, 900), true);
  assert.equal(divergente(1000, null), false);
  assert.equal(divergente(0, 50), false);
});

test("motivo amigável sem guia", () => {
  assert.match(motivoSemGuia("Não foi encontrada declaração"), /Sem declaração/);
  assert.match(motivoSemGuia("exceção inesperada"), /falhou ao montar/);
});

test("competência anterior no fuso de Brasília", () => {
  // 01/12/2026 02:00 UTC = 30/11/2026 23:00 em Brasília
  assert.deepEqual(agoraBrasilia(new Date("2026-12-01T02:00:00Z")), { competenciaAnterior: "2026-10", diaHoje: 30 });
  assert.deepEqual(agoraBrasilia(new Date("2026-01-15T15:00:00Z")), { competenciaAnterior: "2025-12", diaHoje: 15 });
});
