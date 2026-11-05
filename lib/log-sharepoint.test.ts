import { test } from "node:test";
import assert from "node:assert/strict";
import { montarCamposSp, registrarLogSharepoint } from "./log-sharepoint.ts";
import type { DadosAvisoLucro } from "./notificacao-teams.ts";

const d: DadosAvisoLucro = { evento: "novo", competencia: "2026-10", codigoempresa: 1233, nomeEmpresa: "E&G", codigosocio: 7, nomeSocio: "GABRIEL", rendimento: 42312.89, imposto: 0 };
const env = { SHAREPOINT_TENANT_ID: "t", SHAREPOINT_CLIENT_ID: "i", SHAREPOINT_CLIENT_SECRET: "SEGREDO", SHAREPOINT_SITE_ID: "s", SHAREPOINT_LISTA_LUCROS_ID: "l" };

test("campos seguem o log do Access", () => {
  const c = montarCamposSp(d, "julia@x.com", new Date("2026-11-05T12:00:00Z"));
  assert.equal(c.STATUS, "1º LANÇAMENTO");
  assert.equal(c.CODIGOEMPRESA, 1233);
  assert.equal(c.VALORRENDPAGO, 42312.89);
  assert.equal(c.COMPETENCIA, "2026-10");
  assert.equal(montarCamposSp({ ...d, evento: "excluido" }, "x").STATUS, "LANÇAMENTO EXCLUIDO");
  assert.equal(montarCamposSp({ ...d, evento: "alterado" }, "x").STATUS, "LANÇAMENTO ALTERADO");
});

test("sem variáveis fica desligado e não chama a rede", async () => {
  let n = 0;
  const r = await registrarLogSharepoint(d, "x", { env: {}, fetchFn: (async () => { n++; return new Response(null); }) as typeof fetch });
  assert.equal(r, "desligado"); assert.equal(n, 0);
});

test("pega token e grava o item", async () => {
  const urls: string[] = []; let corpo = "";
  const fetchFn = (async (u: string, init?: RequestInit) => {
    urls.push(u);
    if (u.includes("oauth2")) return new Response(JSON.stringify({ access_token: "tk" }), { status: 200 });
    corpo = String(init?.body); return new Response(null, { status: 201 });
  }) as typeof fetch;
  assert.equal(await registrarLogSharepoint(d, "x", { env, fetchFn }), "gravado");
  assert.match(urls[1]!, /sites\/s\/lists\/l\/items/);
  assert.match(corpo, /1º LANÇAMENTO/);
});

test("falhas viram 'falhou' sem vazar segredo", async () => {
  const logs: string[] = []; const orig = console.error;
  console.error = (...a: unknown[]) => { logs.push(a.join(" ")); };
  try {
    assert.equal(await registrarLogSharepoint(d, "x", { env, fetchFn: (async () => new Response(null, { status: 401 })) as typeof fetch }), "falhou");
    assert.equal(await registrarLogSharepoint(d, "x", { env, fetchFn: (async () => { throw new Error("SEGREDO"); }) as typeof fetch }), "falhou");
  } finally { console.error = orig; }
  assert.ok(logs.length === 2 && logs.every((l) => !l.includes("SEGREDO")));
});
