// node --experimental-strip-types --test lib/dissidio-grupos.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { chaveEmpresa, casarGrupos, nomeGrupo, codigoDaPasta } from "./dissidio-grupos.ts";

test("chave ignora acento, pontuação e tipo societário", () => {
  assert.equal(chaveEmpresa("BELLA BRAZOLIN PEDRAS, MÁRMORES E GRANITOS LTDA"), "bella brazolin pedras marmores e granitos");
  assert.equal(chaveEmpresa("2M NEGÓCIOS DIGITAIS LTDA"), "2m negocios digitais");
  assert.equal(chaveEmpresa("AMYNA CLINICA MEDICA LTDA"), "amyna clinica medica");
});

test("chave remove código na frente e no fim", () => {
  assert.equal(chaveEmpresa("534 - BELLA BRAZOLIN"), "bella brazolin");
  assert.equal(chaveEmpresa("BELLA BRAZOLIN 534"), "bella brazolin");
});

test("chave remove sufixo interno da PHD", () => {
  assert.equal(chaveEmpresa("GOSH CABELEIREIROS LTDA - ZEN"), "gosh cabeleireiros");
  assert.equal(chaveEmpresa("ESPACO CHARMOSA LTDA-WPP"), "espaco charmosa");
});

test("casa nome idêntico como exata", () => {
  const r = casarGrupos(
    [{ nome: "TRISQUEL SERVICOS LTDA", grupo: "GRUPO LBF" }],
    [{ codigoempresa: 10, nome: "TRISQUEL SERVICOS LTDA" }]
  );
  assert.equal(r.casados.length, 1);
  assert.equal(r.casados[0].codigoempresa, 10);
  assert.equal(r.casados[0].confianca, "exata");
  assert.equal(r.casados[0].grupo, "GRUPO LBF");
});

test("casa por prefixo como provável", () => {
  const r = casarGrupos(
    [{ nome: "CENTRAL TURBO COMERCIO", grupo: "GRUPO X" }],
    [{ codigoempresa: 622, nome: "CENTRAL TURBO COMERCIO E MANUTENCAO DE VEICULOS LTDA" }]
  );
  assert.equal(r.casados.length, 1);
  assert.equal(r.casados[0].confianca, "provavel");
});

test("prefixo curto NÃO casa — evitaria juntar empresas diferentes", () => {
  const r = casarGrupos(
    [{ nome: "MARIA", grupo: "GRUPO Y" }],
    [{ codigoempresa: 1, nome: "MARIA APARECIDA BARBOSA LTDA" }]
  );
  assert.equal(r.casados.length, 0);
  assert.equal(r.pastasSemEmpresa.length, 1, "curto demais: melhor não casar do que casar errado");
});

test("mais de uma candidata vira ambígua, não escolhe no chute", () => {
  const r = casarGrupos(
    [{ nome: "SAO PAULO COMERCIO", grupo: "GRUPO Z" }],
    [
      { codigoempresa: 1, nome: "SAO PAULO COMERCIO DE ALIMENTOS LTDA" },
      { codigoempresa: 2, nome: "SAO PAULO COMERCIO DE VEICULOS LTDA" },
    ]
  );
  assert.equal(r.casados.length, 0);
  assert.equal(r.ambiguas.length, 1);
  assert.equal(r.ambiguas[0].candidatas.length, 2);
});

test("pasta sem empresa correspondente é reportada", () => {
  const r = casarGrupos(
    [{ nome: "EMPRESA QUE NAO EXISTE NO QUESTOR", grupo: "GRUPO W" }],
    [{ codigoempresa: 1, nome: "OUTRA COISA" }]
  );
  assert.equal(r.casados.length, 0);
  assert.equal(r.pastasSemEmpresa.length, 1);
});

test("uma empresa não entra em dois grupos", () => {
  const r = casarGrupos(
    [
      { nome: "ALFA SERVICOS LTDA", grupo: "GRUPO A" },
      { nome: "ALFA SERVICOS LTDA", grupo: "GRUPO B" },
    ],
    [{ codigoempresa: 7, nome: "ALFA SERVICOS LTDA" }]
  );
  assert.equal(r.casados.length, 1, "a segunda pasta não pode roubar a empresa");
  assert.equal(r.casados[0].grupo, "GRUPO A");
  assert.equal(r.pastasSemEmpresa.length, 1);
});

test("empresa sem nome não gera casamento", () => {
  const r = casarGrupos(
    [{ nome: "QUALQUER", grupo: "G" }],
    [{ codigoempresa: 1, nome: null }]
  );
  assert.equal(r.casados.length, 0);
});

test("nomeGrupo padroniza a apresentação", () => {
  assert.equal(nomeGrupo("  grupo   lbf "), "GRUPO LBF");
});

// ---------------------------------------------- casamento por código

test("lê o código no começo da pasta", () => {
  assert.equal(codigoDaPasta("534 - BELLA BRAZOLIN"), 534);
  assert.equal(codigoDaPasta("1356-1 ASSOCIACAO TRISQUEL"), 1356);
  assert.equal(codigoDaPasta("622 – CENTRAL TURBO"), 622);
  assert.equal(codigoDaPasta("BELLA BRAZOLIN"), null, "sem código não inventa");
});

test("código manda sobre o nome", () => {
  // O nome da pasta está diferente do cadastro; o código resolve.
  const r = casarGrupos(
    [{ nome: "534 - BELLA (NOME ANTIGO)", grupo: "GRUPO LBF" }],
    [{ codigoempresa: 534, nome: "BELLA BRAZOLIN PEDRAS, MARMORES E GRANITOS LTDA" }]
  );
  assert.equal(r.casados.length, 1);
  assert.equal(r.casados[0].codigoempresa, 534);
  assert.equal(r.casados[0].confianca, "codigo");
});

test("código que não existe no Questor não cai para o nome", () => {
  // Casar pelo nome aqui poderia atribuir o grupo à empresa errada.
  const r = casarGrupos(
    [{ nome: "9999 - ALFA SERVICOS LTDA", grupo: "GRUPO A" }],
    [{ codigoempresa: 7, nome: "ALFA SERVICOS LTDA" }]
  );
  assert.equal(r.casados.length, 0);
  assert.equal(r.pastasSemEmpresa.length, 1);
});

test("código resolve o que o nome deixaria ambíguo", () => {
  const r = casarGrupos(
    [{ nome: "2 - SAO PAULO COMERCIO", grupo: "GRUPO Z" }],
    [
      { codigoempresa: 1, nome: "SAO PAULO COMERCIO DE ALIMENTOS LTDA" },
      { codigoempresa: 2, nome: "SAO PAULO COMERCIO DE VEICULOS LTDA" },
    ]
  );
  assert.equal(r.ambiguas.length, 0);
  assert.equal(r.casados[0].codigoempresa, 2);
});

test("pastas sem código seguem casando por nome", () => {
  const r = casarGrupos(
    [{ nome: "TRISQUEL SERVICOS LTDA", grupo: "GRUPO LBF" }],
    [{ codigoempresa: 10, nome: "TRISQUEL SERVICOS LTDA" }]
  );
  assert.equal(r.casados[0].confianca, "exata");
});
