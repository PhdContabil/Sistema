// Paginação do livro "A História da PHD".
//
// O texto continua um só (TEXTO_HISTORIA, em sobre-nos.ts) e o RH segue
// editando do mesmo jeito: cada marco `@ ano | chamada` vira uma página do
// livro. O que vem antes do primeiro marco é o prólogo; o que vem depois de um
// `## título` que não é marco (hoje, "E a história continua") é o epílogo.
//
// SEM IMPORTS de valor: roda direto no `node --test` com strip-types.

import type { Bloco } from "./conteudo-formato";

export type TipoPagina = "capa" | "prologo" | "capitulo" | "epilogo";

export interface Pagina {
  tipo: TipoPagina;
  /** Ano do marco ("2011", "2013 e 2014", "30 de novembro de 2009"). */
  ano: string;
  /** Chamada do capítulo, em caixa alta no texto original. */
  titulo: string;
  /** Conteúdo da página, sem o marco nem o título que a abriram. */
  blocos: Bloco[];
}

export interface OpcoesLivro {
  tituloCapa: string;
  subtituloCapa: string;
}

/**
 * Corta os blocos do texto em páginas.
 *
 * Nenhum bloco se perde: tudo o que não abre página entra na página corrente.
 * Um texto sem nenhum marco vira capa + uma página só, em vez de livro vazio.
 */
export function paginasDoLivro(blocos: Bloco[], op: OpcoesLivro): Pagina[] {
  const paginas: Pagina[] = [
    { tipo: "capa", ano: "", titulo: op.tituloCapa, blocos: [] },
  ];

  let corrente: Pagina = { tipo: "prologo", ano: "", titulo: op.subtituloCapa, blocos: [] };
  let viuMarco = false;

  const publicar = () => {
    if (corrente.blocos.length > 0 || corrente.tipo === "capitulo") paginas.push(corrente);
  };

  for (let i = 0; i < blocos.length; i++) {
    const b = blocos[i];

    // A primeira linha solta do texto ("Uma história construída por pessoas")
    // já é o subtítulo da capa; repeti-la no prólogo seria eco.
    if (i === 0 && b.tipo === "paragrafo" && b.texto === op.subtituloCapa) continue;

    if (b.tipo === "marco") {
      publicar();
      viuMarco = true;
      corrente = { tipo: "capitulo", ano: b.ano, titulo: b.texto, blocos: [] };
      continue;
    }

    // Título depois dos marcos fecha a linha do tempo: é o epílogo.
    if (b.tipo === "titulo" && viuMarco) {
      publicar();
      corrente = { tipo: "epilogo", ano: "", titulo: b.texto, blocos: [] };
      continue;
    }

    corrente.blocos.push(b);
  }
  publicar();

  return paginas;
}

/** Rótulo curto para a régua de navegação: "2011", "2013–14", "Início". */
export function rotuloDaPagina(p: Pagina): string {
  if (p.tipo === "capa") return "Capa";
  if (p.tipo === "prologo") return "Início";
  if (p.tipo === "epilogo") return "Hoje";
  const anos = p.ano.match(/\d{4}/g) ?? [];
  if (anos.length === 0) return p.ano;
  if (anos.length === 1) return anos[0];
  // "2013 e 2014" -> "2013–14": cabe na régua sem quebrar.
  return `${anos[0]}–${anos[anos.length - 1].slice(2)}`;
}

/** Limita o índice ao livro, para teclado e swipe nunca saírem da última página. */
export function limitar(i: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(0, Math.trunc(i)), total - 1);
}
