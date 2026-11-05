// node --experimental-strip-types --test lib/nfse/formato.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  lerCsv, linhaParaNota, montarSdtrps, lerResposta, erroDeSequencia, lerImpressao,
  tipoLogradouro, converterValor, competenciasParaPdf,
} from "./formato.ts";

const CSV = `"rps_serie","rps_numero","data_prestacao","valor_nota","observacao_nota","tipo_pessoa","cpf_cnpj","razao_social","inscricao_municipal","email","tipo_logradouro","logradouro","numero_endereco","complemento","bairro","municipio","uf","cep","descricao_servico","codigo_servico"
"NF","13.407","30/09/2026","1.552,31","(Valor aproximado)","J","61085212000103","ANTUNES INCORPORADORA E INVESTIMENTOS LTDA","","paralegal@phdcontabil.com.br; outro@x.com","","R.LUIZ CARLOS VENTURA","0","SALA 03","Jardim Mituzi","Taboão da Serra","SP","6775270","Folha de Pagamento - Qtd: 1.00","17.19"
"NF","13.408","30/09/2026","500,00","","J","00000000000000","CLIENTES DIVERSOS","","","Rua","X","1","","B","SAO PAULO","SP","00000000","Teste",""`;

test("CSV do nSQL vira nota normalizada", () => {
  const linhas = lerCsv(CSV);
  assert.equal(linhas.length, 2);
  const { nota, problemas } = linhaParaNota(linhas[0]);
  assert.deepEqual(problemas, []);
  assert.equal(nota.rps_numero, 13407);
  assert.equal(nota.valor, 1552.31);
  assert.equal(nota.data_prestacao, "2026-09-30");
  assert.equal(nota.tomador.cep, "06775270");
  assert.equal(nota.tomador.tipo_logradouro, "Rua");
  assert.equal(nota.tomador.logradouro, "LUIZ CARLOS VENTURA");
  assert.equal(nota.tomador.numero, "S/N");
  assert.equal(nota.tomador.municipio, "TABOAO DA SERRA");
  assert.equal(nota.tomador.email, "paralegal@phdcontabil.com.br");
});

test("Clientes Diversos e CEP zerado são barrados", () => {
  const { problemas } = linhaParaNota(lerCsv(CSV)[1]);
  assert.ok(problemas.some((p) => p.includes("tudo zero")));
  assert.ok(problemas.some((p) => p.includes("CEP")));
});

test("XML no layout 4.0 com ISS de 5% e valores com vírgula", () => {
  const xml = montarSdtrps(linhaParaNota(lerCsv(CSV)[0]).nota);
  assert.match(xml, /<NumRps>13407<\/NumRps>/);
  assert.match(xml, /<VlNFS>1552,31<\/VlNFS>/);
  assert.match(xml, /<VlIss>77,62<\/VlIss>/);
  assert.match(xml, /<DtEmi>30\/09\/2026<\/DtEmi>/);
  assert.match(xml, /<Mes>09<\/Mes>/);
});

test("resposta do webservice e erro de sequência", () => {
  const r = lerResposta(`<soap:Envelope><soap:Body><Sdt_processarpsout xmlns="NFe"><Retorno>false</Retorno><Messages><Message><Id>E</Id><Type>1</Type><Description>Sequ&#234;ncia do RPS inv&#225;lida. &#218;ltimo RPS Processado/Cancelado: 13405</Description></Message></Messages></Sdt_processarpsout></soap:Body></soap:Envelope>`);
  assert.equal(r.retorno, false);
  assert.equal(r.mensagens.length, 1);
  const s = erroDeSequencia("Sequência do RPS inválida. Último RPS Processado/Cancelado: 13405");
  assert.deepEqual(s, { sequencia: true, ultimo: 13405 });
  assert.equal(lerResposta("<Retorno>true</Retorno><Protocolo>123</Protocolo>").protocolo, "123");
});

test("link do PDF vem escapado dentro de Xml_saida", () => {
  const d = lerImpressao(`<Xml_saida>&lt;SDT_IMPRESSAO_OUT&gt;&lt;LinkImpressao&gt;https://x/y.pdf?a=1&amp;amp;b=2&lt;/LinkImpressao&gt;&lt;NumNf&gt;21711&lt;/NumNf&gt;&lt;SerNf&gt;E&lt;/SerNf&gt;&lt;CodVernf&gt;ABC&lt;/CodVernf&gt;&lt;/SDT_IMPRESSAO_OUT&gt;</Xml_saida>`);
  assert.equal(d?.numero_nota, "21711");
  assert.equal(d?.link, "https://x/y.pdf?a=1&b=2");
});

test("utilitários", () => {
  assert.deepEqual(tipoLogradouro("AV.", "TORQUATO"), ["Avenida", "TORQUATO"]);
  assert.deepEqual(tipoLogradouro("", "AVENIDA EUCLIDES"), ["Avenida", "EUCLIDES"]);
  assert.equal(converterValor("1614.15"), 1614.15);
  assert.deepEqual(competenciasParaPdf("2026-01-20", "2026-03-02"), [[1, 2026], [12, 2025], [3, 2026]]);
});
