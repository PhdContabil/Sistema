// node --experimental-strip-types --test lib/pessoas/historia-livro.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { blocosDoTexto } from "./conteudo-formato.ts";
import { paginasDoLivro, rotuloDaPagina, limitar } from "./historia-livro.ts";
import { TEXTO_HISTORIA } from "./sobre-nos.ts";

const OP = { tituloCapa: "A História da PHD", subtituloCapa: "Uma história construída por pessoas" };

test("capa, prólogo, capítulos e epílogo, nessa ordem", () => {
  const b = blocosDoTexto("Uma história construída por pessoas\n\nIntro.\n\n@ 2010 | CONSTRUIR\n\nTexto.\n\n## Fim\n\nÚltimo.");
  const p = paginasDoLivro(b, OP);
  assert.deepEqual(p.map((x) => x.tipo), ["capa", "prologo", "capitulo", "epilogo"]);
  assert.equal(p[2].ano, "2010");
  assert.equal(p[2].titulo, "CONSTRUIR");
  assert.equal(p[3].titulo, "Fim");
});

test("o subtítulo da capa não se repete no prólogo", () => {
  const p = paginasDoLivro(blocosDoTexto("Uma história construída por pessoas\n\nIntro."), OP);
  assert.deepEqual(p[1].blocos, [{ tipo: "paragrafo", texto: "Intro." }]);
});

test("nenhum bloco se perde na paginação", () => {
  const b = blocosDoTexto(TEXTO_HISTORIA);
  const p = paginasDoLivro(b, OP);
  const marcos = b.filter((x) => x.tipo === "marco").length;
  const titulosEpilogo = 1;
  const eco = 1; // o subtítulo que vira capa
  const dentro = p.reduce((n, x) => n + x.blocos.length, 0);
  assert.equal(dentro + marcos + titulosEpilogo + eco, b.length);
});

test("a história real vira 15 capítulos", () => {
  const p = paginasDoLivro(blocosDoTexto(TEXTO_HISTORIA), OP);
  assert.equal(p.filter((x) => x.tipo === "capitulo").length, 15);
  assert.equal(p[0].tipo, "capa");
  assert.equal(p[p.length - 1].tipo, "epilogo");
});

test("capítulo sem texto ainda vira página", () => {
  // Um marco recém-colado, antes do RH escrever o texto, não pode sumir do livro.
  const p = paginasDoLivro(blocosDoTexto("@ 2027 | EM BREVE"), OP);
  assert.equal(p[p.length - 1].ano, "2027");
});

test("título antes de qualquer marco não abre epílogo", () => {
  const p = paginasDoLivro(blocosDoTexto("## Abertura\n\nTexto."), OP);
  assert.deepEqual(p.map((x) => x.tipo), ["capa", "prologo"]);
  assert.equal(p[1].blocos[0].tipo, "titulo");
});

test("texto vazio vira só a capa", () => {
  assert.deepEqual(paginasDoLivro([], OP).map((x) => x.tipo), ["capa"]);
});

test("rótulos da régua", () => {
  const cap = (ano: string) => ({ tipo: "capitulo" as const, ano, titulo: "", blocos: [] });
  assert.equal(rotuloDaPagina(cap("2011")), "2011");
  assert.equal(rotuloDaPagina(cap("2013 e 2014")), "2013–14");
  assert.equal(rotuloDaPagina(cap("30 de novembro de 2009")), "2009");
  assert.equal(rotuloDaPagina({ tipo: "capa", ano: "", titulo: "", blocos: [] }), "Capa");
  assert.equal(rotuloDaPagina({ tipo: "epilogo", ano: "", titulo: "", blocos: [] }), "Hoje");
});

test("limitar nunca sai do livro", () => {
  assert.equal(limitar(-1, 10), 0);
  assert.equal(limitar(10, 10), 9);
  assert.equal(limitar(4.7, 10), 4);
  assert.equal(limitar(3, 0), 0);
});
