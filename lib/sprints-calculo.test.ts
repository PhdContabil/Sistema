// node --experimental-strip-types --test lib/sprints-calculo.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  diasUteis, datasUteis, somarDias, capacidadePessoa, diasTrabalhados, resumoCapacidade,
  fimPadrao, restante, horasEmTexto,
  burndown, analytics,
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

// ============================================================== burndown

// Semana de 14 a 18/09/2026: segunda a sexta, 5 dias úteis.
const SEMANA = { inicio: "2026-09-14", fim: "2026-09-18" };

test("sem lançamento, a linha real fica parada no total", () => {
  const b = burndown(SEMANA.inicio, SEMANA.fim, 40, {}, "2026-09-18");
  assert.equal(b.length, 5);
  assert.deepEqual(b.map((p) => p.real), [40, 40, 40, 40, 40]);
});

test("a linha ideal desce por igual e zera no último dia", () => {
  const b = burndown(SEMANA.inicio, SEMANA.fim, 40, {}, "2026-09-18");
  assert.deepEqual(b.map((p) => p.ideal), [40, 30, 20, 10, 0]);
});

test("cada hora lançada derruba a linha real", () => {
  const b = burndown(SEMANA.inicio, SEMANA.fim, 40, {
    "2026-09-14": 8, "2026-09-15": 12,
  }, "2026-09-18");
  assert.equal(b[0].real, 32);
  assert.equal(b[1].real, 20);
  assert.equal(b[2].real, 20, "dia sem lançamento mantém o patamar");
});

test("dia futuro não tem linha real", () => {
  const b = burndown(SEMANA.inicio, SEMANA.fim, 40, { "2026-09-14": 8 }, "2026-09-15");
  assert.equal(b[1].real, 20 + 12, "15/09 ainda é hoje");
  assert.equal(b[2].real, null);
  assert.equal(b[4].real, null);
  assert.equal(b[2].ideal, 20, "a régua continua desenhada até o fim");
});

test("trabalho além do total não deixa a linha negativa", () => {
  const b = burndown(SEMANA.inicio, SEMANA.fim, 10, { "2026-09-14": 25 }, "2026-09-18");
  assert.equal(b[0].real, 0);
});

test("hora lançada no sábado entra no dia útil seguinte", () => {
  // 19/09 é sábado; 21/09 seria segunda, fora da semana — cai no último dia.
  const b = burndown(SEMANA.inicio, SEMANA.fim, 40, { "2026-09-16": 5, "2026-09-19": 3 }, "2026-09-18");
  assert.equal(b[2].lancado, 5);
  assert.equal(b[4].lancado, 3, "não some do total");
  assert.equal(b[4].real, 32);
});

test("lançamento antes do início da sprint cai no primeiro dia", () => {
  const b = burndown(SEMANA.inicio, SEMANA.fim, 40, { "2026-09-10": 4 }, "2026-09-18");
  assert.equal(b[0].lancado, 4);
});

test("sprint de um dia só não divide por zero", () => {
  const b = burndown("2026-09-16", "2026-09-16", 8, {}, "2026-09-16");
  assert.equal(b.length, 1);
  assert.equal(b[0].ideal, 8);
});

test("período sem dia útil devolve lista vazia", () => {
  assert.deepEqual(burndown("2026-09-19", "2026-09-20", 10, {}, "2026-09-20"), []);
});

// ============================================================== analytics

const NOME_ST: Record<string, string> = { desenvolvimento: "Desenvolvimento", finalizado: "Finalizado" };
const NOME_SE: Record<string, string> = { fiscal: "Fiscal", contabil: "Contábil" };

const ITENS = [
  { ticket_id: "a", numero: 1, titulo: "Um", status: "finalizado", setor: "fiscal",
    responsavel_email: "gabriel@phd.com", estimate: 10, lancado: 8 },
  { ticket_id: "b", numero: 2, titulo: "Dois", status: "desenvolvimento", setor: "fiscal",
    responsavel_email: "gabriel@phd.com", estimate: 6, lancado: 2 },
  { ticket_id: "c", numero: 3, titulo: "Três", status: "finalizado", setor: "contabil",
    responsavel_email: "pedro@phd.com", estimate: 4, lancado: 4 },
];

test("totaliza estimado, lançado e cartões", () => {
  const a = analytics(ITENS, NOME_ST, NOME_SE);
  assert.equal(a.totalEstimado, 20);
  assert.equal(a.totalLancado, 14);
  assert.equal(a.cartoes, 3);
  assert.equal(a.fechados, 2);
});

test("agrupa por status e por setor de origem", () => {
  const a = analytics(ITENS, NOME_ST, NOME_SE);
  assert.equal(a.porStatus.find((s) => s.id === "finalizado")!.qtd, 2);
  assert.equal(a.porSetor[0].id, "fiscal");
  assert.equal(a.porSetor[0].qtd, 2);
  assert.equal(a.porSetor[0].horas, 10);
});

test("soma planejado e lançado por pessoa", () => {
  const a = analytics(ITENS, NOME_ST, NOME_SE, { "gabriel@phd.com": "Gabriel" });
  const g = a.porPessoa.find((p) => p.email === "gabriel@phd.com")!;
  assert.equal(g.nome, "Gabriel");
  assert.equal(g.planejado, 16);
  assert.equal(g.lancado, 10);
});

test("cartão sem dono não entra na conta de ninguém", () => {
  const a = analytics([
    { ...ITENS[0], responsavel_email: null },
  ], NOME_ST, NOME_SE);
  assert.equal(a.porPessoa.length, 0);
  assert.equal(a.totalLancado, 8, "mas continua no total da sprint");
});

test("precisão mostra o desvio e ordena pelo maior", () => {
  const a = analytics(ITENS, NOME_ST, NOME_SE);
  assert.equal(a.precisao[0].ticket_id, "b", "4 h de folga é o maior desvio");
  assert.equal(a.precisao[0].desvio, 4);
  assert.equal(a.precisao.find((p) => p.ticket_id === "a")!.consumo, 80);
});

test("consumo médio olha só os cartões fechados", () => {
  const a = analytics(ITENS, NOME_ST, NOME_SE);
  // Fechados: 8/10 = 80% e 4/4 = 100% → média 90%.
  assert.equal(a.consumoMedioFechados, 90);
});

test("sem cartão fechado não inventa média", () => {
  const a = analytics([ITENS[1]], NOME_ST, NOME_SE);
  assert.equal(a.consumoMedioFechados, null);
});

test("cartão sem estimate não vira divisão por zero", () => {
  const a = analytics([
    { ...ITENS[0], estimate: null, lancado: 5 },
  ], NOME_ST, NOME_SE);
  assert.equal(a.precisao[0].consumo, 0);
  assert.equal(a.consumoMedioFechados, null, "sem teto, não entra na média");
});

test("sprint vazia não quebra", () => {
  const a = analytics([], NOME_ST, NOME_SE);
  assert.equal(a.cartoes, 0);
  assert.equal(a.totalEstimado, 0);
  assert.equal(a.consumoMedioFechados, null);
});
