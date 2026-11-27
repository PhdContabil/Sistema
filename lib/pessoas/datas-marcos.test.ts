// node --experimental-strip-types --test lib/pessoas/datas-marcos.test.ts
//
// Só a lógica pura de Datas e Marcos: marcos de tempo de casa, datas móveis
// (Páscoa, 2º domingo), 29/02, agrupamento por dia e experiência de 90 dias.
import test from "node:test";
import assert from "node:assert/strict";
import {
  aniversariantesDoMes, campanhaDoMes, dataDaRegra, ehMarco, emExperiencia, eventosDoMes,
  fimExperienciaEm, pascoa, segundoDomingo, somaDias, tempoDeCasaDoMes,
  type DataComemorativa, type PessoaDatas,
} from "./datas-marcos.ts";

const pessoa = (id: number, nome: string, nasc: string | null, adm: string | null, ativo = true): PessoaDatas => ({
  pessoa_id: id, nome, ativo, data_nascimento: nasc, data_admissao: adm,
  fim_experiencia: adm ? somaDias(adm, 90) : null,
});

const dc = (p: Partial<DataComemorativa> & Pick<DataComemorativa, "regra" | "titulo">): DataComemorativa => ({
  id: 1, tipo: "outro", mes: null, dia: null, data_unica: null, cor: null, ...p,
});

test("marco: 1 ano e múltiplos de 5", () => {
  assert.deepEqual([1, 2, 4, 5, 6, 10, 15, 20, 25, 0].map(ehMarco), [true, false, false, true, false, true, true, true, true, false]);
});

test("Páscoa", () => {
  assert.deepEqual(pascoa(2026), { mes: 4, dia: 5 });
  assert.deepEqual(pascoa(2027), { mes: 3, dia: 28 });
  assert.deepEqual(pascoa(2028), { mes: 4, dia: 16 });
});

test("2º domingo de maio e de agosto", () => {
  assert.equal(segundoDomingo(2026, 5), 10);
  assert.equal(segundoDomingo(2026, 8), 9);
  assert.equal(segundoDomingo(2027, 5), 9);
  assert.equal(segundoDomingo(2027, 8), 8);
});

test("data da regra", () => {
  assert.equal(dataDaRegra(dc({ regra: "anual", titulo: "x", mes: 9, dia: 22 }), 2031), "2031-09-22");
  assert.equal(dataDaRegra(dc({ regra: "segundo_domingo", titulo: "x", mes: 5 }), 2026), "2026-05-10");
  assert.equal(dataDaRegra(dc({ regra: "unica", titulo: "x", data_unica: "2027-03-10" }), 2026), null);
  assert.equal(dataDaRegra(dc({ regra: "unica", titulo: "x", data_unica: "2027-03-10" }), 2027), "2027-03-10");
});

test("29/02 cai em 28/02 fora de ano bissexto", () => {
  const ps = [pessoa(1, "Bia", "1996-02-29", null)];
  assert.deepEqual(aniversariantesDoMes(2027, 2, ps), [{ dia: 28, nome: "Bia" }]);
  assert.deepEqual(aniversariantesDoMes(2028, 2, ps), [{ dia: 29, nome: "Bia" }]);
});

test("tempo de casa: só 1 ano ou mais, só ativos, com marco", () => {
  const ps = [
    pessoa(1, "Graciele", null, "2025-12-15"),
    pessoa(2, "Nova", null, "2026-12-03"),
    pessoa(3, "Carla", null, "2010-12-19"),
    pessoa(4, "Saiu", null, "2020-12-20", false),
    pessoa(5, "Veterana", null, "2011-12-01"),
  ];
  assert.deepEqual(tempoDeCasaDoMes(2026, 12, ps), [
    { dia: 1, nome: "Veterana", anos: 15, marco: true },
    { dia: 15, nome: "Graciele", anos: 1, marco: true },
    { dia: 19, nome: "Carla", anos: 16, marco: false },
  ]);
});

test("aniversário vale mesmo para inativo (lista do RH)", () => {
  const ps = [pessoa(35, "Sr. Campos", "1966-06-09", null, false)];
  assert.equal(aniversariantesDoMes(2026, 6, ps).length, 1);
});

test("experiência: fim em 90 dias da admissão", () => {
  const ps = [pessoa(1, "A", null, "2026-09-02"), pessoa(2, "B", null, "2026-10-05"), pessoa(3, "C", null, "2026-01-02")];
  assert.equal(ps[0].fim_experiencia, "2026-12-01");
  assert.deepEqual(fimExperienciaEm("2026-12-01", ps).map((p) => p.nome), ["A"]);
  assert.deepEqual(emExperiencia("2026-11-27", ps).map((p) => p.nome), ["A", "B"]);
  // 7 dias antes do fim: dia do aviso
  assert.equal(somaDias("2026-12-01", -7), "2026-11-24");
});

test("campanha do mês", () => {
  const datas = [dc({ regra: "mes", titulo: "Novembro Azul", mes: 11, cor: "#2563eb", tipo: "bem_estar" })];
  assert.deepEqual(campanhaDoMes(11, datas), { titulo: "Novembro Azul", cor: "#2563eb" });
  assert.equal(campanhaDoMes(12, datas), null);
});

test("eventos do mês: agrupa por dia e marca destaque", () => {
  const ctx = {
    pessoas: [
      pessoa(1, "Pedro", "2003-05-01", "2024-04-09"),
      pessoa(2, "Eloiza", "1992-05-01", "2026-06-22"),
      pessoa(3, "Graciele", "1980-02-23", "2025-12-15"),
    ],
    datas: [dc({ regra: "anual", titulo: "Dia do Trabalhador", mes: 5, dia: 1 })],
    formaturas: [{ pessoa_id: 1, nome: "Pedro", curso: "Direito", nivel: "Graduação", previsao: "2027-05-01" }],
  };
  const maio = eventosDoMes(2027, 5, ctx);
  assert.ok(maio.find((e) => e.titulo === "🎂 Eloiza, Pedro"));
  assert.ok(maio.find((e) => e.titulo === "Dia do Trabalhador"));
  assert.ok(maio.find((e) => e.titulo === "🎓 Formatura: Pedro"));
  const dez = eventosDoMes(2026, 12, ctx);
  const casa = dez.find((e) => e.titulo.startsWith("🏢"));
  assert.equal(casa?.destaque, true);
  // fim da experiência só quando pedido
  // Eloiza entrou em 22/06/2026: os 90 dias terminam em 20/09/2026.
  assert.equal(eventosDoMes(2026, 9, ctx).some((e) => e.titulo.startsWith("⏳")), false);
  assert.equal(eventosDoMes(2026, 9, { ...ctx, incluirExperiencia: true }).some((e) => e.titulo === "⏳ Fim da experiência: Eloiza"), true);
});
