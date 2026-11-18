import test from "node:test";
import assert from "node:assert/strict";
import { competenciaTareffa, escolherResponsavelFiscal, escolherServicoDarf, montarCorpoAvulso, vencimentoDarf } from "./tarefa-darf-lucros-formato.ts";

test("vencimento: dia 15 do mês seguinte, virando o ano em dezembro", () => {
  assert.equal(vencimentoDarf("2026-10"), "2026-11-15");
  assert.equal(vencimentoDarf("2026-12"), "2027-01-15");
  assert.equal(vencimentoDarf("2026-01"), "2026-02-15");
});

test("competência no formato do Tareffa", () => {
  assert.equal(competenciaTareffa("2026-10"), "10/2026");
});

test("responsável fiscal: pega o do Departamento Fiscal", () => {
  const r = escolherResponsavelFiscal([
    { grupoServico: { id: 19908, descricao: "Departamento Contábil" }, responsavel: { id: 1, nome: "Carolina Silva" } },
    { grupoServico: { id: 19909, descricao: "Departamento Fiscal" }, responsavel: { id: 1026852, nome: "Karina Paes de Camargo" } },
    { grupoServico: { id: 19910, descricao: "Departamento Pessoal" }, responsavel: { id: 3, nome: "Gean Victor" } },
  ]);
  assert.deepEqual(r, { id: 1026852, nome: "Karina Paes de Camargo" });
});

test("responsável fiscal: sem fiscal cadastrado (ou sem responsável) devolve null", () => {
  assert.equal(escolherResponsavelFiscal([{ grupoServico: { descricao: "Departamento Contábil" }, responsavel: { id: 1, nome: "A" } }]), null);
  assert.equal(escolherResponsavelFiscal([{ grupoServico: { descricao: "Departamento Fiscal" } }]), null);
  assert.equal(escolherResponsavelFiscal([]), null);
});

test("serviço DARF 1841: só aceita um resultado inequívoco", () => {
  const lista = [
    { id: 1, nome: "Guia DARF Lucros ou Dividendos IRRF 1841" },
    { id: 2, nome: "Guia DARF Aluguéis IRRF 3208" },
  ];
  assert.deepEqual(escolherServicoDarf(lista), lista[0]);
  assert.equal(escolherServicoDarf([lista[1]]), null);
  assert.equal(escolherServicoDarf([lista[0], { id: 9, nome: "guia darf lucros 1841 (copia)" }]), null);
});

test("corpo do avulso: exemplo 10/2026 vence 15/11/2026", () => {
  const c = montarCorpoAvulso({ servicoId: 54268782, clienteId: 53683518, usuarioId: 9590588, competencia: "2026-10", observacoes: "", referencia: "" });
  assert.deepEqual(c, {
    servico: { id: 54268782 }, cliente: { id: 53683518 }, alocadoPara: { id: 9590588 },
    dataVencimento: "2026-11-15T03:00:00.000Z", observacoes: "", referencia: "",
    tipoGeracao: 2, retificacao: false, competencia: "10/2026", nrOcorrencias: 1, tempoUnitario: 0, valorUnitario: 0,
  });
});
