// node --experimental-strip-types --test lib/nfse/nacional-formato.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { idDps, montarDps, validarNac, txt, lerRespostaSefin, dhEmiAgora, problemasConfig, PHD_NACIONAL } from "./nacional-formato.ts";

const cfg = { ...PHD_NACIONAL, ambiente: 2 as const, pTotTribSN: 6 };
const nota = {
  nDPS: 13407, dCompet: "2026-10-31", valor: 552.31, descricao: "Folha – Qtd 1 “x” <a&b>", infoCompl: "",
  tomador: { cpf_cnpj: "61085212000103", razao_social: "ANTUNES", inscricao_municipal: "", email: "a@b.com",
    tipo_logradouro: "Rua", logradouro: "Luiz Carlos Ventura", numero: "99", complemento: "SALA 03",
    bairro: "Jardim Mituzi", cep: "06775270", ibge: "3552809" },
};

test("Id da DPS com 45 caracteres e corpo sem zeros à esquerda", () => {
  const id = idDps(cfg, 13407);
  assert.equal(id, "DPS3552809211274011000186" + "00001" + "000000000013407");
  assert.equal(id.length, 45);
  const { xml } = montarDps(nota, cfg, "2026-11-10T10:00:00-03:00");
  assert.match(xml, /<serie>1<\/serie><nDPS>13407<\/nDPS>/);
  assert.match(xml, /<opSimpNac>3<\/opSimpNac><regApTribSN>1<\/regApTribSN><regEspTrib>0<\/regEspTrib>/);
  assert.match(xml, /<pTotTribSN>6\.00<\/pTotTribSN>/);
  assert.doesNotMatch(xml, /pAliq/);
  assert.match(xml, /<cMun>3552809<\/cMun><CEP>06775270<\/CEP>/);
  assert.match(xml, /<vServ>552\.31<\/vServ>/);
  assert.doesNotMatch(xml, />\s+</);
});

test("texto higienizado e escapado", () => {
  assert.equal(txt("Folha – “x” <a&b> 😀", 100), "Folha - &quot;x&quot; &lt;a&amp;b&gt;");
});

test("validações antes de enviar", () => {
  assert.deepEqual(validarNac(nota, "2026-11-10"), []);
  assert.ok(validarNac({ ...nota, dCompet: "2026-12-01" }, "2026-11-10").some((p) => p.includes("futuro")));
  assert.ok(validarNac({ ...nota, tomador: { ...nota.tomador, ibge: "" } }, "2026-11-10").some((p) => p.includes("IBGE")));
});

test("resposta da Sefin", () => {
  assert.equal(lerRespostaSefin({ chaveAcesso: "1".repeat(50), nfseXmlGZipB64: "x" }).chave, "1".repeat(50));
  const e = lerRespostaSefin({ Erros: [{ Codigo: "E0014", Descricao: "DPS já usada" }] });
  assert.equal(e.erros[0].codigo, "E0014");
  assert.match(dhEmiAgora(new Date("2026-11-10T13:00:00Z")), /^2026-11-10T09:59:00-03:00$/);
});

test("regime por empresa: não optante usa indTotTrib e não manda regApTribSN", () => {
  const { xml } = montarDps(nota, { ...cfg, opSimpNac: 1, cNBS: "" }, "2026-11-10T10:00:00-03:00");
  assert.match(xml, /<opSimpNac>1<\/opSimpNac><regEspTrib>0<\/regEspTrib>/);
  assert.match(xml, /<indTotTrib>0<\/indTotTrib>/);
  assert.doesNotMatch(xml, /cNBS|pTotTribSN|regApTribSN/);
  assert.deepEqual(problemasConfig(cfg), []);
  assert.equal(problemasConfig({ ...cfg, cLocEmi: "", pTotTribSN: 0 }).length, 2);
});
