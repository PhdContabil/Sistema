// node --experimental-strip-types --test lib/sprints-calculo.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  diasUteis, datasUteis, somarDias, capacidadePessoa, diasTrabalhados, resumoCapacidade,
  formatDuracao, segundosEmHoras, fimPadrao, restante, horasEmTexto,
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

test("capacidade é horas por dia vezes dias trabalhados", () => {
  assert.equal(capacidadePessoa(6, 11), 66);
});

test("sem horas por dia, sem capacidade", () => {
  assert.equal(capacidadePessoa(0, 11), 0);
  assert.equal(capacidadePessoa(null, 11), 0);
});

test("meio período dá meia capacidade", () => {
  assert.equal(capacidadePessoa(3, 11), 33);
});

test("dias negativos não viram capacidade negativa", () => {
  assert.equal(capacidadePessoa(6, -3), 0);
});

// ------------------------------------------------------ folgas e feriados

const P = { inicio: "2026-09-14", fim: "2026-09-28" }; // 11 dias úteis

test("lista os dias úteis do período", () => {
  const d = datasUteis(P.inicio, P.fim);
  assert.equal(d.length, 11);
  assert.equal(d[0], "2026-09-14");
  assert.ok(!d.includes("2026-09-19"), "sábado fora");
});

test("feriado do time tira o dia de todo mundo", () => {
  const folgas = [{ data: "2026-09-16", email: null, motivo: "Feriado" }];
  assert.equal(diasTrabalhados(P.inicio, P.fim, folgas, "gabriel@phd.com"), 10);
  assert.equal(diasTrabalhados(P.inicio, P.fim, folgas, "pedro@phd.com"), 10);
});

test("férias de uma pessoa não tiram dia da outra", () => {
  const folgas = [
    { data: "2026-09-21", email: "pedro@phd.com" },
    { data: "2026-09-22", email: "pedro@phd.com" },
  ];
  assert.equal(diasTrabalhados(P.inicio, P.fim, folgas, "pedro@phd.com"), 9);
  assert.equal(diasTrabalhados(P.inicio, P.fim, folgas, "gabriel@phd.com"), 11);
});

test("folga pessoal no mesmo dia do feriado não desconta duas vezes", () => {
  const folgas = [
    { data: "2026-09-16", email: null },
    { data: "2026-09-16", email: "pedro@phd.com" },
  ];
  assert.equal(diasTrabalhados(P.inicio, P.fim, folgas, "pedro@phd.com"), 10);
});

test("folga caída em fim de semana não muda nada", () => {
  const folgas = [{ data: "2026-09-20", email: null }];
  assert.equal(diasTrabalhados(P.inicio, P.fim, folgas, "x@phd.com"), 11);
});

test("folga fora do período da sprint é ignorada", () => {
  const folgas = [{ data: "2026-10-15", email: null }];
  assert.equal(diasTrabalhados(P.inicio, P.fim, folgas, "x@phd.com"), 11);
});

test("e-mail da folga com caixa diferente é a mesma pessoa", () => {
  const folgas = [{ data: "2026-09-16", email: "Pedro@PHD.com" }];
  assert.equal(diasTrabalhados(P.inicio, P.fim, folgas, "pedro@phd.com"), 10);
});

// --------------------------------------------------------------- resumo

const time = [
  { email: "gabriel@phd.com", nome: "Gabriel", horas_dia: 6 },
  { email: "pedro@phd.com", nome: "Pedro", horas_dia: 6 },
];

/** Pedro com 5 dias de férias na sprint. */
const FERIAS_PEDRO = [
  { data: "2026-09-21", email: "pedro@phd.com" },
  { data: "2026-09-22", email: "pedro@phd.com" },
  { data: "2026-09-23", email: "pedro@phd.com" },
  { data: "2026-09-24", email: "pedro@phd.com" },
  { data: "2026-09-25", email: "pedro@phd.com" },
];

test("soma o planejado de cada um e sobra o livre", () => {
  const r = resumoCapacidade(time, [
    { ticket_id: "a", responsavel_email: "gabriel@phd.com", horas_planejadas: 20 },
    { ticket_id: "b", responsavel_email: "gabriel@phd.com", horas_planejadas: 10 },
    { ticket_id: "c", responsavel_email: "pedro@phd.com", horas_planejadas: 8 },
  ], { ...P, folgas: FERIAS_PEDRO });

  const g = r.linhas.find((l) => l.email === "gabriel@phd.com")!;
  assert.equal(g.capacidade, 66);
  assert.equal(g.planejado, 30);
  assert.equal(g.livre, 36);
  assert.equal(g.itens, 2);
  assert.equal(g.estourou, false);

  const p = r.linhas.find((l) => l.email === "pedro@phd.com")!;
  assert.equal(p.diasFora, 5);
  assert.equal(p.capacidade, 36, "5 dias de férias saem da conta");
  assert.equal(p.livre, 28);

  assert.equal(r.capacidadeTotal, 102);
  assert.equal(r.planejadoTotal, 38);
  assert.equal(r.livreTotal, 64);
});

test("estouro é sinalizado, não escondido", () => {
  const r = resumoCapacidade(time, [
    { ticket_id: "a", responsavel_email: "pedro@phd.com", horas_planejadas: 40 },
  ], { ...P, folgas: FERIAS_PEDRO });
  const p = r.linhas.find((l) => l.email === "pedro@phd.com")!;
  assert.equal(p.estourou, true);
  assert.equal(p.livre, -4);
  assert.ok(p.ocupacao > 100);
});

test("item sem responsável não some dentro do total de ninguém", () => {
  const r = resumoCapacidade(time, [
    { ticket_id: "a", responsavel_email: null, horas_planejadas: 12 },
    { ticket_id: "b", responsavel_email: "gabriel@phd.com", horas_planejadas: 5 },
  ], P);
  assert.equal(r.semResponsavel.horas, 12);
  assert.equal(r.semResponsavel.itens, 1);
  assert.equal(r.planejadoTotal, 17, "mas continua pesando no total da sprint");
  const g = r.linhas.find((l) => l.email === "gabriel@phd.com")!;
  assert.equal(g.planejado, 5);
});

test("quem tem item sem estar no time aparece estourado", () => {
  const r = resumoCapacidade(time, [
    { ticket_id: "a", responsavel_email: "novato@phd.com", horas_planejadas: 4 },
  ], P);
  const n = r.linhas.find((l) => l.email === "novato@phd.com")!;
  assert.equal(n.capacidade, 0);
  assert.equal(n.estourou, true);
});

test("item sem horas planejadas conta como zero, não quebra", () => {
  const r = resumoCapacidade(time, [
    { ticket_id: "a", responsavel_email: "gabriel@phd.com", horas_planejadas: null },
  ], P);
  const g = r.linhas.find((l) => l.email === "gabriel@phd.com")!;
  assert.equal(g.planejado, 0);
  assert.equal(g.itens, 1, "o item existe mesmo sem estimativa");
});

test("e-mail com caixa diferente é a mesma pessoa", () => {
  const r = resumoCapacidade(time, [
    { ticket_id: "a", responsavel_email: "Gabriel@PHD.com", horas_planejadas: 7 },
  ], P);
  const g = r.linhas.find((l) => l.email === "gabriel@phd.com")!;
  assert.equal(g.planejado, 7);
});

test("sprint sem itens: tudo livre", () => {
  const r = resumoCapacidade(time, [], P);
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

test("feriado do time derruba a capacidade total", () => {
  const semFeriado = resumoCapacidade(time, [], P);
  const comFeriado = resumoCapacidade(time, [], {
    ...P, folgas: [{ data: "2026-09-16", email: null, motivo: "Feriado" }],
  });
  assert.equal(semFeriado.capacidadeTotal, 132, "2 pessoas x 6h x 11 dias");
  assert.equal(comFeriado.capacidadeTotal, 120, "um dia a menos para os dois");
  assert.equal(comFeriado.diasUteisSprint, 11, "o dia útil existe; é a pessoa que não trabalha");
});

// ------------------------------------------------------- restante do item

test("restante desconta o que já foi apontado", () => {
  const r = restante(16, 6);
  assert.equal(r.falta, 10);
  assert.equal(r.feito, 6);
  assert.equal(r.estourou, false);
  assert.equal(r.pct, 37.5);
});

test("passar do estimate não deixa o restante negativo", () => {
  const r = restante(8, 11);
  assert.equal(r.falta, 0);
  assert.equal(r.estourou, true);
  assert.equal(r.pct, 100);
});

test("sem estimate não inventa porcentagem", () => {
  const r = restante(null, 5);
  assert.equal(r.estimate, 0);
  assert.equal(r.falta, 0);
  assert.equal(r.pct, 0);
  assert.equal(r.estourou, false);
});

test("nada apontado: falta tudo", () => {
  const r = restante(16, 0);
  assert.equal(r.falta, 16);
  assert.equal(r.pct, 0);
});

test("horas decimais viram horas e minutos", () => {
  assert.equal(horasEmTexto(8), "8h 0m");
  assert.equal(horasEmTexto(1.5), "1h 30m");
  assert.equal(horasEmTexto(0.25), "0h 15m");
  assert.equal(horasEmTexto(null), "0h 0m");
});

test("arredondamento de minuto não vira 60", () => {
  assert.equal(horasEmTexto(2.999), "3h 0m");
});
