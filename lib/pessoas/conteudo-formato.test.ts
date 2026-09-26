// node --experimental-strip-types --test lib/pessoas/conteudo-formato.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { blocosDoTexto } from "./conteudo-formato.ts";

test("texto sem marcação nenhuma continua virando parágrafos", () => {
  // Garantia de retrocompatibilidade: as seções antigas usam \n\n e nada mais.
  const b = blocosDoTexto("Primeiro parágrafo.\n\nSegundo parágrafo.");
  assert.deepEqual(b, [
    { tipo: "paragrafo", texto: "Primeiro parágrafo." },
    { tipo: "paragrafo", texto: "Segundo parágrafo." },
  ]);
});

test("texto vazio ou ausente não gera bloco", () => {
  assert.deepEqual(blocosDoTexto(""), []);
  assert.deepEqual(blocosDoTexto(undefined), []);
  assert.deepEqual(blocosDoTexto("\n\n   \n"), []);
});

test("título e subtítulo", () => {
  assert.deepEqual(blocosDoTexto("## Missão\n### Por que existimos?"), [
    { tipo: "titulo", texto: "Missão" },
    { tipo: "subtitulo", texto: "Por que existimos?" },
  ]);
});

test("### é subtítulo, não título com sustenido sobrando", () => {
  // A ordem dos testes no parser importa: '## ' casaria com '### ' se viesse antes.
  const b = blocosDoTexto("### Abc");
  assert.equal(b[0].tipo, "subtitulo");
});

test("marco com ano e chamada", () => {
  assert.deepEqual(blocosDoTexto("@ 2011 | UMA NOVA SOCIEDADE"), [
    { tipo: "marco", ano: "2011", texto: "UMA NOVA SOCIEDADE" },
  ]);
});

test("marco sem chamada fica só com o ano", () => {
  assert.deepEqual(blocosDoTexto("@ 2024"), [{ tipo: "marco", ano: "2024", texto: "" }]);
});

test("marco aceita intervalo de anos", () => {
  const b = blocosDoTexto("@ 2013 e 2014 | INVESTIR E VALORIZAR PESSOAS");
  assert.deepEqual(b, [{ tipo: "marco", ano: "2013 e 2014", texto: "INVESTIR E VALORIZAR PESSOAS" }]);
});

test("citação", () => {
  assert.deepEqual(blocosDoTexto("> Você nunca está errado em fazer a coisa certa."), [
    { tipo: "citacao", texto: "Você nunca está errado em fazer a coisa certa." },
  ]);
});

test("linhas de lista seguidas viram uma lista só", () => {
  assert.deepEqual(blocosDoTexto("- Ética\n- Respeito\n- Justiça"), [
    { tipo: "lista", itens: ["Ética", "Respeito", "Justiça"] },
  ]);
});

test("linha em branco separa duas listas", () => {
  const b = blocosDoTexto("- a\n- b\n\n- c");
  assert.deepEqual(b, [
    { tipo: "lista", itens: ["a", "b"] },
    { tipo: "lista", itens: ["c"] },
  ]);
});

test("a lista fecha antes de qualquer outro bloco", () => {
  const b = blocosDoTexto("- a\n## Título\n- b");
  assert.deepEqual(b.map((x) => x.tipo), ["lista", "titulo", "lista"]);
});

test("a lista fecha no fim do texto", () => {
  // Sem isto, o último item sumiria: a lista só é publicada quando fecha.
  assert.deepEqual(blocosDoTexto("- último"), [{ tipo: "lista", itens: ["último"] }]);
});

test("imagem solta vira galeria de uma figura", () => {
  assert.deepEqual(blocosDoTexto("![Logo de 2009](/pessoas/identidade/logo-2009.png)"), [
    { tipo: "galeria", figuras: [{ src: "/pessoas/identidade/logo-2009.png", legenda: "Logo de 2009" }] },
  ]);
});

test("imagem sem legenda é aceita", () => {
  const b = blocosDoTexto("![](/a.png)");
  assert.deepEqual(b, [{ tipo: "galeria", figuras: [{ src: "/a.png", legenda: "" }] }]);
});

test("galeria agrupa as figuras do bloco", () => {
  const b = blocosDoTexto(":::galeria\n![2009](/a.png)\n![2012](/b.png)\n:::");
  assert.deepEqual(b, [
    {
      tipo: "galeria",
      figuras: [
        { src: "/a.png", legenda: "2009" },
        { src: "/b.png", legenda: "2012" },
      ],
    },
  ]);
});

test("texto dentro da galeria não vira parágrafo perdido", () => {
  const b = blocosDoTexto(":::galeria\nisto aqui é comentário\n![x](/a.png)\n:::\nDepois.");
  assert.deepEqual(b, [
    { tipo: "galeria", figuras: [{ src: "/a.png", legenda: "x" }] },
    { tipo: "paragrafo", texto: "Depois." },
  ]);
});

test("galeria sem fechar publica as figuras mesmo assim", () => {
  // Um ':::' esquecido não pode fazer as imagens desaparecerem da tela.
  const b = blocosDoTexto(":::galeria\n![x](/a.png)");
  assert.deepEqual(b, [{ tipo: "galeria", figuras: [{ src: "/a.png", legenda: "x" }] }]);
});

test("galeria vazia não gera bloco", () => {
  assert.deepEqual(blocosDoTexto(":::galeria\n:::"), []);
});

test("espaço extra no começo e no fim da linha não atrapalha", () => {
  const b = blocosDoTexto("   ## Título   \n   - item  ");
  assert.deepEqual(b, [
    { tipo: "titulo", texto: "Título" },
    { tipo: "lista", itens: ["item"] },
  ]);
});

test("hífen no meio da frase não vira lista", () => {
  const b = blocosDoTexto("Kaizen - melhoria contínua - traduz essa busca.");
  assert.equal(b[0].tipo, "paragrafo");
});
