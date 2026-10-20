// npx tsx --test lib/robo-zen/conferencia-cnpj.test.ts
//
// (tsx porque os módulos do Robô Zen importam uns aos outros sem a extensão ".ts".)
//
// Só as partes puras: ler os CNPJs de um texto, compará-los com o CNPJ do cadastro do
// Questor, decidir o que fazer com cada documento e montar os textos de status. O PDF, o
// SharePoint e as APIs do Questor/Zen não entram aqui.
import test from "node:test";
import assert from "node:assert/strict";
import {
  avaliarDocumentoComReferencia,
  cnpjDeReferencia,
  cnpjsValidosDoTexto,
  conferirCnpjComCadastro,
  digitosDoCnpj,
  indexarCadastro,
  mesmaRaiz,
  normalizarCodigoEmpresa,
  statusCnpjDoEnvioAnteriorErrado,
  statusCnpjErrado,
  avisoCnpjNaoConfirmado,
  porqueNaoConfirmada,
  statusCnpjNaoConfirmado,
} from "./conferencia-cnpj";

// CNPJs com dígito verificador correto (conferidos com cnpjValido).
const DA_EMPRESA = "11.222.333/0001-81";
const FILIAL = "11.222.333/0002-62"; // mesma raiz da empresa, outro estabelecimento
const SINDICATO = "62.811.096/0001-25";
const SOCIA = "28.107.999/0001-91";
const INVALIDO = "11.222.333/0001-82"; // dígito verificador errado

test("cnpjsValidosDoTexto: só os válidos, sem repetir, formatados, na ordem do texto", () => {
  const texto = `Contrato da empresa CNPJ 11222333000181, sócia ${SOCIA}, sindicato ${SINDICATO}.
    Novamente ${DA_EMPRESA}. Lixo: ${INVALIDO}. Telefone 11 99999-9999.`;
  assert.deepEqual(cnpjsValidosDoTexto(texto), [DA_EMPRESA, SOCIA, SINDICATO]);
});

test("cnpjsValidosDoTexto: texto sem CNPJ devolve lista vazia", () => {
  assert.deepEqual(cnpjsValidosDoTexto("Sem nada parecido aqui. 12345"), []);
  assert.deepEqual(cnpjsValidosDoTexto(""), []);
});

test("cnpjDeReferencia: só serve CNPJ de 14 dígitos com dígito verificador certo", () => {
  assert.equal(cnpjDeReferencia("11222333000181"), DA_EMPRESA);
  assert.equal(cnpjDeReferencia(DA_EMPRESA), DA_EMPRESA);
  assert.equal(cnpjDeReferencia(INVALIDO), null);
  assert.equal(cnpjDeReferencia("123"), null);
  assert.equal(cnpjDeReferencia(""), null);
  assert.equal(cnpjDeReferencia(null), null);
  assert.equal(cnpjDeReferencia(undefined), null);
});

test("mesmaRaiz: matriz e filial têm os mesmos 8 primeiros dígitos", () => {
  assert.equal(mesmaRaiz(DA_EMPRESA, FILIAL), true);
  assert.equal(mesmaRaiz(DA_EMPRESA, SINDICATO), false);
  assert.equal(mesmaRaiz(DA_EMPRESA, "lixo"), false);
});

test("conferir: o documento cita o CNPJ do cadastro (entre outros) → CONFERE", () => {
  const r = conferirCnpjComCadastro(
    [
      { arquivo: "Aditivo sindical.pdf", cnpjs: [SINDICATO] },
      { arquivo: "Contrato social.pdf", cnpjs: [SOCIA, DA_EMPRESA] },
    ],
    "11222333000181" // o cadastro pode vir sem pontuação
  );
  assert.deepEqual(r, { tipo: "CONFERE", cnpj: DA_EMPRESA, arquivo: "Contrato social.pdf" });
});

test("conferir: só CNPJs de outras empresas → DIFERENTE (com o que foi lido e onde)", () => {
  const r = conferirCnpjComCadastro(
    [
      { arquivo: "A.pdf", cnpjs: [SINDICATO] },
      { arquivo: "B.pdf", cnpjs: [SOCIA, FILIAL] },
    ],
    DA_EMPRESA
  );
  assert.equal(r.tipo, "DIFERENTE");
  if (r.tipo !== "DIFERENTE") return;
  assert.equal(r.cadastro, DA_EMPRESA);
  assert.deepEqual(r.lidos, [
    { arquivo: "A.pdf", cnpj: SINDICATO, mesmaRaiz: false },
    { arquivo: "B.pdf", cnpj: SOCIA, mesmaRaiz: false },
    { arquivo: "B.pdf", cnpj: FILIAL, mesmaRaiz: true },
  ]);
});

test("conferir: filial NÃO confere com a matriz (igualdade dos 14 dígitos)", () => {
  const r = conferirCnpjComCadastro([{ arquivo: "A.pdf", cnpjs: [FILIAL] }], DA_EMPRESA);
  assert.equal(r.tipo, "DIFERENTE");
});

test("conferir: sem CNPJ de referência (empresa fora do cadastro ou CNPJ inválido lá) → SEM_REFERENCIA", () => {
  const docs = [{ arquivo: "A.pdf", cnpjs: [DA_EMPRESA] }];
  assert.deepEqual(conferirCnpjComCadastro(docs, null), { tipo: "SEM_REFERENCIA" });
  assert.deepEqual(conferirCnpjComCadastro(docs, ""), { tipo: "SEM_REFERENCIA" });
  assert.deepEqual(conferirCnpjComCadastro(docs, INVALIDO), { tipo: "SEM_REFERENCIA" });
});

test("conferir: referência existe mas nenhum documento trouxe CNPJ válido → NENHUM_LIDO", () => {
  assert.deepEqual(conferirCnpjComCadastro([], DA_EMPRESA), { tipo: "NENHUM_LIDO" });
  assert.deepEqual(conferirCnpjComCadastro([{ arquivo: "A.pdf", cnpjs: [] }], DA_EMPRESA), { tipo: "NENHUM_LIDO" });
});

test("avaliar documento: cita o CNPJ do cadastro, mesmo que o leitor tenha escolhido outro → USAR", () => {
  // O leitor de certidão devolveu o do sindicato (primeiro válido), mas o texto também cita o da empresa.
  const texto = `Convenção do sindicato ${SINDICATO}. Empresa: ${DA_EMPRESA}.`;
  const r = avaliarDocumentoComReferencia({ nome: "Contrato.pdf", cnpjDoLeitor: SINDICATO, texto }, DA_EMPRESA);
  assert.deepEqual(r, { tipo: "USAR", cnpj: DA_EMPRESA });
});

test("avaliar documento: só cita outros CNPJs → DESCARTAR, com explicação", () => {
  const texto = `Sócia ${SOCIA}. Sindicato ${SINDICATO}.`;
  const r = avaliarDocumentoComReferencia({ nome: "Contrato.pdf", cnpjDoLeitor: SOCIA, texto }, DA_EMPRESA);
  assert.equal(r.tipo, "DESCARTAR");
  if (r.tipo !== "DESCARTAR") return;
  assert.deepEqual(r.cnpjs, [SOCIA, SINDICATO]);
  assert.match(r.problema, /^Contrato\.pdf: li os CNPJs 28\.107\.999\/0001-91, 62\.811\.096\/0001-25, mas nenhum deles é o CNPJ desta empresa no Questor \(11\.222\.333\/0001-81\)$/);
});

test("avaliar documento: um único CNPJ de outra empresa usa o singular", () => {
  const r = avaliarDocumentoComReferencia({ nome: "X.pdf", cnpjDoLeitor: SOCIA, texto: `CNPJ ${SOCIA}` }, DA_EMPRESA);
  assert.equal(r.tipo, "DESCARTAR");
  if (r.tipo !== "DESCARTAR") return;
  assert.match(r.problema, /li o CNPJ 28\.107\.999\/0001-91, mas ele não é o CNPJ desta empresa/);
});

test("avaliar documento: o CNPJ do leitor conta mesmo que a varredura do texto não o tenha achado", () => {
  // Texto sem nenhum CNPJ escrito de forma reconhecível, mas o leitor achou um (ex.: layout de tabela).
  const r = avaliarDocumentoComReferencia({ nome: "X.pdf", cnpjDoLeitor: DA_EMPRESA, texto: "sem cnpj legível" }, DA_EMPRESA);
  assert.deepEqual(r, { tipo: "USAR", cnpj: DA_EMPRESA });
});

test("avaliar documento: nenhum CNPJ válido (ou só um com dígito errado) → SEM_CNPJ_VALIDO (tratamento de sempre)", () => {
  assert.deepEqual(
    avaliarDocumentoComReferencia({ nome: "X.pdf", cnpjDoLeitor: null, texto: "nada" }, DA_EMPRESA),
    { tipo: "SEM_CNPJ_VALIDO" }
  );
  assert.deepEqual(
    avaliarDocumentoComReferencia({ nome: "X.pdf", cnpjDoLeitor: INVALIDO, texto: `CNPJ ${INVALIDO}` }, DA_EMPRESA),
    { tipo: "SEM_CNPJ_VALIDO" }
  );
});

test("normalizarCodigoEmpresa: tira zeros à esquerda e espaços", () => {
  assert.equal(normalizarCodigoEmpresa("0576"), "576");
  assert.equal(normalizarCodigoEmpresa(" 576 "), "576");
  assert.equal(normalizarCodigoEmpresa(576), "576");
  assert.equal(normalizarCodigoEmpresa("0"), "0");
  assert.equal(normalizarCodigoEmpresa("A12"), "A12");
  assert.equal(normalizarCodigoEmpresa(null), "");
});

test("indexarCadastro: por código; repetido fica com a linha que tem CNPJ válido", () => {
  const mapa = indexarCadastro([
    { codigoempresa: 576, cnpj: DA_EMPRESA, ativa: true },
    { codigoempresa: 907, cnpj: null, ativa: false },
    { codigoempresa: 1408, cnpj: SOCIA, ativa: true },
    { codigoempresa: 1408, cnpj: null, ativa: true }, // linha pior não derruba a boa
    { codigoempresa: 55, cnpj: SINDICATO, ativa: false },
    { codigoempresa: 55, cnpj: SINDICATO, ativa: true }, // entre duas boas, a ativa
  ]);
  assert.deepEqual(mapa.get("576"), { encontrada: true, cnpj: DA_EMPRESA, ativa: true });
  assert.deepEqual(mapa.get("907"), { encontrada: true, cnpj: null, ativa: false });
  assert.deepEqual(mapa.get("1408"), { encontrada: true, cnpj: SOCIA, ativa: true });
  assert.deepEqual(mapa.get("55"), { encontrada: true, cnpj: SINDICATO, ativa: true });
  assert.equal(mapa.get("9999"), undefined);
});

test("digitosDoCnpj", () => {
  assert.equal(digitosDoCnpj(DA_EMPRESA), "11222333000181");
  assert.equal(digitosDoCnpj("123"), null);
  assert.equal(digitosDoCnpj(null), null);
});

// ---- textos de status (os mesmos que a Júlia já viu na tela/planilhas) ----

test("status 'CNPJ errado' (um CNPJ lido)", () => {
  assert.equal(
    statusCnpjErrado([{ arquivo: "Contrato.pdf", cnpj: SINDICATO, mesmaRaiz: false }], DA_EMPRESA),
    `CNPJ NÃO ENCONTRADO em nenhum documento — puxando CNPJ ERRADO: o robô leu ${SINDICATO} em "Contrato.pdf", ` +
      `que não é o CNPJ desta empresa (cadastro do Questor: ${DA_EMPRESA}). ` +
      "Aguardando planilha do setor responsável com os CNPJs corretos."
  );
});

test("status 'CNPJ errado' (vários, com aviso de mesma raiz e corte em 4)", () => {
  const lidos = [
    { arquivo: "A.pdf", cnpj: SINDICATO, mesmaRaiz: false },
    { arquivo: "A.pdf", cnpj: SINDICATO, mesmaRaiz: false }, // repetido: conta uma vez
    { arquivo: "B.pdf", cnpj: SOCIA, mesmaRaiz: false },
    { arquivo: "C.pdf", cnpj: FILIAL, mesmaRaiz: true },
    { arquivo: "D.pdf", cnpj: "00.000.000/0001-91", mesmaRaiz: false },
    { arquivo: "E.pdf", cnpj: "33.000.167/0001-01", mesmaRaiz: false },
  ];
  const s = statusCnpjErrado(lidos, DA_EMPRESA);
  assert.match(s, /^CNPJ NÃO ENCONTRADO em nenhum documento — puxando CNPJ ERRADO: o robô só leu CNPJs que não são o desta empresa/);
  assert.match(s, /62\.811\.096\/0001-25 em "A\.pdf"; 28\.107\.999\/0001-91 em "B\.pdf"; 11\.222\.333\/0002-62 em "C\.pdf"; 00\.000\.000\/0001-91 em "D\.pdf" e mais 1\./);
  assert.match(s, /Obs\.: 11\.222\.333\/0002-62 tem\(têm\) a mesma raiz/);
  assert.match(s, /Aguardando planilha do setor responsável com os CNPJs corretos\.$/);
  assert.equal((s.match(/A\.pdf/g) ?? []).length, 1);
});

test("status do CNPJ de envio anterior errado", () => {
  const s = statusCnpjDoEnvioAnteriorErrado(SINDICATO, DA_EMPRESA);
  assert.match(s, /^CNPJ NÃO ENCONTRADO em nenhum documento — puxando CNPJ ERRADO: o CNPJ usado nos envios anteriores \(62\.811\.096\/0001-25\)/);
  assert.match(s, /documento novo NÃO foi liberado/);
});

test("status 'CNPJ não confirmado'", () => {
  assert.equal(
    statusCnpjNaoConfirmado({ codigo: "199", lido: DA_EMPRESA, causa: "ausente", clienteNoZen: "ESPACO PRANA LTDA" }),
    `CNPJ NÃO CONFIRMADO NO QUESTOR: o robô leu ${DA_EMPRESA} (cliente no Zen: ESPACO PRANA LTDA), ` +
      "mas a empresa 199 não consta no cadastro de empresas do Questor, " +
      "então o CNPJ não pôde ser comparado. Bloqueada por precaução até a confirmação."
  );
  assert.match(
    statusCnpjNaoConfirmado({ codigo: "7", lido: DA_EMPRESA, causa: "sem_cnpj", clienteNoZen: null }),
    /\(esse CNPJ não consta como cliente no Zen\), mas o cadastro da empresa 7 no Questor não tem um CNPJ válido,/
  );
  assert.equal(
    statusCnpjNaoConfirmado({ codigo: "199", lido: DA_EMPRESA, causa: "baixada", clienteNoZen: "ESPACO PRANA LTDA" }),
    `CNPJ NÃO CONFIRMADO NO QUESTOR: o robô leu ${DA_EMPRESA} (cliente no Zen: ESPACO PRANA LTDA), e esse é o CNPJ do cadastro, ` +
      "mas a empresa 199 está baixada (fora da lista de empresas ativas do Questor). Bloqueada por precaução até a confirmação."
  );
  // Consulta ao Zen não feita/falhou: não inventa nada sobre o cliente.
  assert.doesNotMatch(statusCnpjNaoConfirmado({ codigo: "7", lido: DA_EMPRESA, causa: "ausente" }), /Zen/);
});

test("aviso do envio individual (CNPJ não confirmado)", () => {
  assert.equal(
    porqueNaoConfirmada("199", "baixada"),
    "a empresa 199 está baixada (fora da lista de empresas ativas do Questor)"
  );
  assert.equal(
    avisoCnpjNaoConfirmado("199", "ausente"),
    " ATENÇÃO — CNPJ NÃO CONFIRMADO NO QUESTOR: a empresa 199 não consta no cadastro de empresas do Questor, " +
      "então o CNPJ lido não pôde ser comparado. Confira na tela se o cliente do Zen é mesmo o desta empresa antes de confirmar."
  );
  assert.doesNotMatch(avisoCnpjNaoConfirmado("199", "baixada"), /não pôde ser comparado/);
  assert.match(avisoCnpjNaoConfirmado("199", "sem_cnpj"), /não tem um CNPJ válido, então o CNPJ lido não pôde ser comparado/);
});
