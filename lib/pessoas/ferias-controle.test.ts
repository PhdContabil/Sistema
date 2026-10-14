// node --experimental-strip-types --test lib/pessoas/ferias-controle.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { limiteSugerido, fimAquisitivoSugerido, sinalDoAquisitivo, nomeCasa, cobre, casarNomes, prazoParaSolicitar, dentroDoPrazo } from "./ferias-controle.ts";

test("limite igual ao exemplo da Flávia e à regra do Questor", () => {
  assert.equal(fimAquisitivoSugerido("2025-01-10"), "2026-01-09");
  assert.equal(limiteSugerido("2026-01-09"), "2026-12-10");
});

const aq = { id: 1, inicio_aquisitivo: "2025-01-10", fim_aquisitivo: "2026-01-09", limite_gozo: "2026-12-10" };

test("sem programação: prazo, atenção, crítico e vencido", () => {
  assert.equal(sinalDoAquisitivo(aq, [], "2026-06-01"), "prazo");
  assert.equal(sinalDoAquisitivo(aq, [], "2026-08-20"), "atencao");
  assert.equal(sinalDoAquisitivo(aq, [], "2026-11-01"), "critico");
  assert.equal(sinalDoAquisitivo(aq, [], "2026-12-11"), "vencido");
});

test("programação aprovada no intervalo deixa verde; pendente amarelo; recusada não conta", () => {
  const p = (status: string) => ({ status, periodos: [{ inicio: "2026-07-01", fim: "2026-07-20" }] });
  assert.equal(sinalDoAquisitivo(aq, [p("aprovada")], "2026-11-01"), "ok");
  assert.equal(sinalDoAquisitivo(aq, [p("pendente")], "2026-11-01"), "aguardando");
  assert.equal(sinalDoAquisitivo(aq, [p("rejeitada")], "2026-11-01"), "critico");
});

test("férias de antes do fim do aquisitivo não cobrem; vínculo direto cobre", () => {
  assert.equal(cobre(aq, { status: "aprovada", periodos: [{ inicio: "2025-12-01", fim: "2025-12-10" }] }), false);
  assert.equal(cobre(aq, { status: "aprovada", aquisitivo_id: 1, periodos: [{ inicio: "2025-12-01", fim: "2025-12-10" }] }), true);
});

test("nome curto casa com o nome completo do Questor", () => {
  assert.equal(nomeCasa("Julia Rodrigues", "JULIA RODRIGUES CIRILO"), true);
  assert.equal(nomeCasa("Flávia", "FLAVIA DE SOUZA"), true);
  assert.equal(nomeCasa("Sra. Conceição", "MARIA CONCEICAO SILVA"), true);
  assert.equal(nomeCasa("Julia Araujo", "JULIA RODRIGUES CIRILO"), false);
});

test("casar nomes resolve ambiguidade em rodadas", () => {
  const m = casarNomes(
    [{ id: 1, nome: "Maria" }, { id: 2, nome: "Sra. Conceição" }, { id: 3, nome: "Ed Carlos" }, { id: 4, nome: "Júlia Helena" }],
    ["MARIA APARECIDA DE SOUSA", "MARIA CONCEICAO VIANA DA SILVA", "ED CARLOS CASTRO SOUSA", "ED CARLOS CASTRO SOUSA"],
  );
  assert.equal(m.get(2), "MARIA CONCEICAO VIANA DA SILVA");
  assert.equal(m.get(1), "MARIA APARECIDA DE SOUSA");
  assert.equal(m.get(3), "ED CARLOS CASTRO SOUSA");
  assert.equal(m.has(4), false);
});

test("pedido até o dia 15 do mês anterior", () => {
  assert.equal(prazoParaSolicitar("2026-10-20"), "2026-09-15");
  assert.equal(prazoParaSolicitar("2027-01-05"), "2026-12-15");
  assert.equal(dentroDoPrazo("2026-10-20", "2026-09-15"), true);
  assert.equal(dentroDoPrazo("2026-10-20", "2026-09-16"), false);
});
