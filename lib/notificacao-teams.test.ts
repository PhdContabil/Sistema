import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avisarLucro, formatarCompetencia, formatarValor, montarCartaoTeams, montarLinhasAvisoLucro,
  type DadosAvisoLucro,
} from "./notificacao-teams.ts";

const base: DadosAvisoLucro = {
  evento: "novo", competencia: "2026-10", codigoempresa: 1233, nomeEmpresa: "E&G ASSESORIA E GESTAO LTDA",
  codigosocio: 7, nomeSocio: "GABRIEL MAXIMO DOS SANTOS MALON", rendimento: 42312.89, imposto: 0,
};

test("formata valores em reais e competência", () => {
  assert.equal(formatarValor(42312.89), "42.312,89");
  assert.equal(formatarValor(0), "0,00");
  assert.equal(formatarValor(1234567.5), "1.234.567,50");
  assert.equal(formatarValor(Number.NaN), "0,00");
  assert.equal(formatarCompetencia("2026-10"), "10/2026");
  assert.equal(formatarCompetencia("2026-10-31"), "10/2026");
});

test("aviso de novo lançamento segue o layout do fluxo do Access", () => {
  assert.deepEqual(montarLinhasAvisoLucro(base), [
    "Novo Lançamento:", "Competência: 10/2026",
    "Código Empresa:", "1233 - E&G ASSESORIA E GESTAO LTDA",
    "Sócio:", "GABRIEL MAXIMO DOS SANTOS MALON",
    "Lucro Distribuído:", "42.312,89",
    "Retenção:", "0,00",
  ]);
});

test("títulos de alterado e excluído; nomes ausentes não quebram", () => {
  assert.equal(montarLinhasAvisoLucro({ ...base, evento: "excluido" })[0], "Lançamento Excluído:");
  assert.equal(montarLinhasAvisoLucro({ ...base, evento: "alterado" })[0], "Lançamento Alterado:");
  const l = montarLinhasAvisoLucro({ ...base, nomeEmpresa: null, nomeSocio: null, imposto: 5100 });
  assert.equal(l[3], "1233 - (nome não encontrado)");
  assert.equal(l[5], "Sócio 7");
  assert.equal(l[9], "5.100,00");
});

test("cartão adaptativo tem um bloco por linha", () => {
  const c = montarCartaoTeams(["A", "B"]);
  assert.equal(c.type, "message");
  assert.equal(c.attachments[0]!.contentType, "application/vnd.microsoft.card.adaptive");
  assert.deepEqual(c.attachments[0]!.content.body.map((b) => b.text), ["A", "B"]);
});

test("sem URL o aviso fica desligado e não chama a rede", async () => {
  let chamou = false;
  const r = await avisarLucro(base, { url: "", fetchFn: (async () => { chamou = true; return new Response(null); }) as typeof fetch });
  assert.equal(r, "desligada");
  assert.equal(chamou, false);
});

test("envia o cartão por POST e devolve 'enviada'", async () => {
  let corpo = ""; let metodo = "";
  const fetchFn = (async (_u: string, init?: RequestInit) => { metodo = String(init?.method); corpo = String(init?.body); return new Response(null, { status: 202 }); }) as typeof fetch;
  const r = await avisarLucro(base, { url: "https://exemplo.invalid/hook", fetchFn });
  assert.equal(r, "enviada");
  assert.equal(metodo, "POST");
  assert.match(corpo, /Novo Lançamento:/);
  assert.match(corpo, /42\.312,89/);
});

test("falhas do Teams viram 'falhou' sem lançar e sem vazar a URL", async () => {
  const logs: string[] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => { logs.push(a.join(" ")); };
  try {
    const url = "https://segredo.invalid/hook?sig=abc123";
    assert.equal(await avisarLucro(base, { url, fetchFn: (async () => new Response(null, { status: 500 })) as typeof fetch }), "falhou");
    assert.equal(await avisarLucro(base, { url, fetchFn: (async () => { throw new Error(`falha em ${url}`); }) as typeof fetch }), "falhou");
  } finally { console.error = original; }
  assert.ok(logs.length === 2);
  assert.ok(logs.every((l) => !l.includes("segredo.invalid") && !l.includes("abc123")));
});
