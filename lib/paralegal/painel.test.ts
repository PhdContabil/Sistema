// node --experimental-strip-types --test lib/paralegal/painel.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { montarPainel, nomeResponsavel, categoriaPrazo, resumir, porResponsavel } from "./painel.ts";

const HOJE = "2026-11-12";
const at = (id: number, order: string, p: Partial<{ situation: string | null; closed_in: string | null; deadline_in: string | null; responsible: string | null }> = {}) => ({
  id, name: "Atividade " + order, responsible: "Flavia Cavalcante", situation: null, order, closed_in: null, deadline_in: null, ...p,
});

test("nomes escritos de formas diferentes viram uma pessoa", () => {
  assert.equal(nomeResponsavel("RAFAEL SANTOS"), "Rhafael Santos");
  assert.equal(nomeResponsavel("Rhafael Santos"), "Rhafael Santos");
  assert.equal(nomeResponsavel("JULIA HELENA"), "Júlia Helena");
  assert.equal(nomeResponsavel("Júlia Helena"), "Júlia Helena");
  assert.equal(nomeResponsavel(null), "Sem responsável");
});

test("faixas de prazo", () => {
  assert.equal(categoriaPrazo("2026-11-12", HOJE).categoria, "vence_2d");
  assert.equal(categoriaPrazo("2026-11-14", HOJE).categoria, "vence_2d");
  assert.equal(categoriaPrazo("2026-11-15", HOJE).categoria, "vence_7d");
  assert.equal(categoriaPrazo("2026-11-19", HOJE).categoria, "vence_7d");
  assert.equal(categoriaPrazo("2026-11-20", HOJE).categoria, "futura");
  assert.equal(categoriaPrazo("2026-11-11", HOJE).categoria, "atrasada");
  assert.equal(categoriaPrazo("2026-10-13", HOJE).categoria, "atrasada");
  assert.equal(categoriaPrazo("2026-10-12", HOJE).categoria, "backlog");
  assert.equal(categoriaPrazo(null, HOJE).categoria, "sem_sem_prazo".replace("sem_sem_prazo", "sem_prazo"));
});

test("etapa atual é a primeira que falta, em ordem natural", () => {
  const [p] = montarPainel([{ id: 1, name: "ACME LTDA", status: "ALTA PRIORIDADE", activities: [
    at(3, "10"), at(1, "01", { situation: "Concluído" }), at(2, "04.01"), at(4, "09", { situation: "Não se aplica" }),
  ] }], {}, HOJE);
  assert.equal(p.etapaAtual, "Atividade 04.01");
  assert.equal(p.feitas, 1);
  assert.equal(p.falta, 2);
});

test("processo encerrado e processo de teste ficam de fora", () => {
  const ps = montarPainel([
    { id: 1, name: "A", status: "CONCLUÍDO", activities: [] },
    { id: 2, name: "B", status: "CANCELADO", activities: [] },
    { id: 3, name: "TESTE MODULOS NUCLEO LTDA", status: "ALTA PRIORIDADE", activities: [] },
    { id: 4, name: "D", status: "ALTA PRIORIDADE", activities: [] },
  ], {}, HOJE);
  assert.deepEqual(ps.map((p) => p.id), [4]);
});

test("alertas: atraso, pronto para concluir, sem atividades", () => {
  const ps = montarPainel([
    { id: 1, name: "A", status: "ACOMPANHAMENTO", activities: [at(1, "01", { deadline_in: "2026-11-10" })] },
    { id: 2, name: "B", status: "AGUARDANDO CONCLUSÃO", activities: [at(1, "01", { situation: "Concluído", closed_in: "2026-11-01" })] },
    { id: 3, name: "C", status: "PARADO/SUSPENSO", activities: [] },
    { id: 4, name: "D", status: "ACOMPANHAMENTO", activities: [at(1, "01", { deadline_in: "2026-01-01" })] },
  ], { "1": "05/11 - Aguardando pagamento" }, HOJE);
  assert.deepEqual(ps.map((p) => p.alerta), ["atrasado", "sem_pendencia", "sem_checklist", "backlog"]);
  assert.equal(ps[0].etapaManual, "05/11 - Aguardando pagamento");
  const r = resumir(ps);
  assert.equal(r.atrasados, 1); assert.equal(r.prontos, 1); assert.equal(r.semChecklist, 1); assert.equal(r.faltam, 2);
  assert.equal(porResponsavel(ps)[0].responsavel, "Flavia Cavalcante");
});
