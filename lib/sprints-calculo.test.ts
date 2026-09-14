// node --experimental-strip-types --test lib/sprints-calculo.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  diasUteis, somarDias, capacidadePessoa, resumoCapacidade,
  formatDuracao, segundosEmHoras, fimPadrao,
} from "./sprints-calculo.ts";

// ------------------------------------------------------------- dias úteis

test("conta só de segunda a sexta", () => {
  // 2026-09-14 é segunda; 2026-09-18 é sexta.
  assert.equal(diasUteis("2026-09-14", "2026-09-18"), 5);
});

test("sprint de 15 dias corridos dá 11 dias úteis", () => {
  // Segunda a segunda da terceira semana: 3 semanas menos 2 fins de semana.
  assert.equal(diasUteis("2026-09-14", "2026-09-28"), 11);
});

test("fim de semana inteiro não vale nada", () => {
  assert.equal(diasUteis("2026-09-19", "2026-09-20"), 0);
});

test("um dia útil só", () => {
  assert.equal(diasUteis("2026-09-16", "2026-09-16"), 1);
});

test("fim antes do início não vira número negativo", () => {
  assert.equal(diasUteis("2026-09-20", "2026-09-10"), 0);
});

test("data inválida não explode", () => {
  assert.equal(diasUteis("", "2026-09-10"), 0);
  assert.equal(diasUteis("14/09/2026", "2026-09-18"), 0);
});

test("vira o mês e o ano sem perder dia", () => {
  assert.equal(diasUteis("2026-12-28", "2027-01-08"), 10);
});

// ------------------------------------------------------------- somar dias

test("soma dias atravessando o mês", () => {
  assert.equal(somarDias("2026-09-28", 14), "2026-10-12");
});

test("fim padrão fecha 15 dias corridos contando o início", () => {
  assert.equal(fimPadrao("2026-09-14"), "2026-09-28");
});

// ------------------------------------------------------------ capacidade

test("capacidade é horas por dia vezes dias úteis", () => {
  assert.equal(capacidadePessoa(6, 11, 0), 66);
});

test("dias ausentes descontam", () => {
  assert.equal(capacidadePessoa(6, 11, 3), 48);
});

test("ausência maior que a sprint zera, não inverte", () => {
  assert.equal(capacidadePessoa(6, 11, 20), 0);
});

test("sem horas por dia, sem capacidade", () => {
  assert.equal(capacidadePessoa(0, 11, 0), 0);
  assert.equal(capacidadePessoa(null, 11, 0), 0);
});

test("meio período dá meia capacidade", () => {
  assert.equal(capacidadePessoa(3, 11, 0), 33);
});

// --------------------------------------------------------------- resumo

const time = [
  { email: "gabriel@phd.com", nome: "Gabriel", horas_dia: 6, dias_ausente: 0 },
  { email: "pedro@phd.com", nome: "Pedro", horas_dia: 6, dias_ausente: 5 },
];

test("soma o planejado de cada um e sobra o livre", () => {
  const r = resumoCapacidade(time, [
    { ticket_id: "a", responsavel_email: "gabriel@phd.com", horas_planejadas: 20 },
    { ticket_id: "b", responsavel_email: "gabriel@phd.com", horas_planejadas: 10 },
    { ticket_id: "c", responsavel_email: "pedro@phd.com", horas_planejadas: 8 },
  ], 11);

  const g = r.linhas.find((l) => l.email === "gabriel@phd.com")!;
  assert.equal(g.capacidade, 66);
  assert.equal(g.planejado, 30);
  assert.equal(g.livre, 36);
  assert.equal(g.itens, 2);
  assert.equal(g.estourou, false);

  const p = r.linhas.find((l) => l.email === "pedro@phd.com")!;
  assert.equal(p.capacidade, 36, "5 dias fora saem da conta");
  assert.equal(p.livre, 28);

  assert.equal(r.capacidadeTotal, 102);
  assert.equal(r.planejadoTotal, 38);
  assert.equal(r.livreTotal, 64);
});

test("estouro é sinalizado, não escondido", () => {
  const r = resumoCapacidade(time, [
    { ticket_id: "a", responsavel_email: "pedro@phd.com", horas_planejadas: 40 },
  ], 11);
  const p = r.linhas.find((l) => l.email === "pedro@phd.com")!;
  assert.equal(p.estourou, true);
  assert.equal(p.livre, -4);
  assert.ok(p.ocupacao > 100);
});

test("item sem responsável não some dentro do total de ninguém", () => {
  const r = resumoCapacidade(time, [
    { ticket_id: "a", responsavel_email: null, horas_planejadas: 12 },
    { ticket_id: "b", responsavel_email: "gabriel@phd.com", horas_planejadas: 5 },
  ], 11);
  assert.equal(r.semResponsavel.horas, 12);
  assert.equal(r.semResponsavel.itens, 1);
  assert.equal(r.planejadoTotal, 17, "mas continua pesando no total da sprint");
  const g = r.linhas.find((l) => l.email === "gabriel@phd.com")!;
  assert.equal(g.planejado, 5);
});

test("quem tem item sem estar no time aparece estourado", () => {
  const r = resumoCapacidade(time, [
    { ticket_id: "a", responsavel_email: "novato@phd.com", horas_planejadas: 4 },
  ], 11);
  const n = r.linhas.find((l) => l.email === "novato@phd.com")!;
  assert.equal(n.capacidade, 0);
  assert.equal(n.estourou, true);
});

test("item sem horas planejadas conta como zero, não quebra", () => {
  const r = resumoCapacidade(time, [
    { ticket_id: "a", responsavel_email: "gabriel@phd.com", horas_planejadas: null },
  ], 11);
  const g = r.linhas.find((l) => l.email === "gabriel@phd.com")!;
  assert.equal(g.planejado, 0);
  assert.equal(g.itens, 1, "o item existe mesmo sem estimativa");
});

test("e-mail com caixa diferente é a mesma pessoa", () => {
  const r = resumoCapacidade(time, [
    { ticket_id: "a", responsavel_email: "Gabriel@PHD.com", horas_planejadas: 7 },
  ], 11);
  const g = r.linhas.find((l) => l.email === "gabriel@phd.com")!;
  assert.equal(g.planejado, 7);
});

test("sprint sem itens: tudo livre", () => {
  const r = resumoCapacidade(time, [], 11);
  assert.equal(r.planejadoTotal, 0);
  assert.equal(r.livreTotal, r.capacidadeTotal);
});

// ------------------------------------------------------------ cronômetro

test("duração em formato legível", () => {
  assert.equal(formatDuracao(0), "0min");
  assert.equal(formatDuracao(45), "45s");
  assert.equal(formatDuracao(60 * 45), "45min");
  assert.equal(formatDuracao(3600 * 2 + 60 * 5), "2h 05min");
});

test("duração negativa não vira texto estranho", () => {
  assert.equal(formatDuracao(-500), "0min");
});

test("segundos viram horas decimais com duas casas", () => {
  assert.equal(segundosEmHoras(3600), 1);
  assert.equal(segundosEmHoras(5400), 1.5);
  assert.equal(segundosEmHoras(60 * 20), 0.33);
  assert.equal(segundosEmHoras(null), 0);
});
