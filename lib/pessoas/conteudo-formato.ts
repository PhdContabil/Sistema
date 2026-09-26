// Formatação dos textos institucionais do módulo Pessoas.
//
// Os textos que o RH entrega (história, cultura, identidade visual) não são
// parágrafos soltos: têm títulos, marcos de ano, citações e listas. Jogar tudo
// como <p> vira parede de texto e ninguém lê até o fim.
//
// A marcação é mínima de propósito — quem edita `conteudos.ts` é o RH, não um
// programador. Cinco marcas, todas no começo da linha:
//
//   ## Título              -> título de seção
//   ### Subtítulo          -> subtítulo
//   @ 2011 | O ANO DE ...  -> marco da linha do tempo (ano + chamada)
//   > Frase                -> citação em destaque
//   - item                 -> item de lista (linhas seguidas viram uma lista)
//
// E duas para imagem:
//
//   ![legenda](/caminho.png)     -> uma figura
//   :::galeria ... :::           -> várias figuras lado a lado
//
// SEM IMPORTS: este módulo roda direto no `node --test` com strip-types, que
// não resolve import relativo sem extensão.

export type Bloco =
  | { tipo: "titulo"; texto: string }
  | { tipo: "subtitulo"; texto: string }
  | { tipo: "marco"; ano: string; texto: string }
  | { tipo: "citacao"; texto: string }
  | { tipo: "lista"; itens: string[] }
  | { tipo: "paragrafo"; texto: string }
  | { tipo: "galeria"; figuras: Figura[] };

export interface Figura {
  src: string;
  legenda: string;
}

const RE_IMAGEM = /^!\[([^\]]*)\]\(([^)]+)\)$/;

/**
 * Transforma o texto da seção em blocos prontos para a tela.
 *
 * Linha desconhecida vira parágrafo — nunca some. Um texto colado sem nenhuma
 * marcação continua funcionando exatamente como antes.
 */
export function blocosDoTexto(texto: string | undefined): Bloco[] {
  const blocos: Bloco[] = [];
  if (!texto) return blocos;

  const linhas = texto.split("\n");
  let lista: string[] = [];
  let galeria: Figura[] | null = null;

  const fecharLista = () => {
    if (lista.length > 0) {
      blocos.push({ tipo: "lista", itens: lista });
      lista = [];
    }
  };

  for (const bruta of linhas) {
    const l = bruta.trim();

    // Dentro de uma galeria, só figuras contam; o resto é ignorado.
    if (galeria !== null) {
      if (l === ":::") {
        if (galeria.length > 0) blocos.push({ tipo: "galeria", figuras: galeria });
        galeria = null;
        continue;
      }
      const img = RE_IMAGEM.exec(l);
      if (img) galeria.push({ src: img[2].trim(), legenda: img[1].trim() });
      continue;
    }

    if (l === "") { fecharLista(); continue; }

    if (l === ":::galeria") { fecharLista(); galeria = []; continue; }

    const img = RE_IMAGEM.exec(l);
    if (img) {
      fecharLista();
      blocos.push({ tipo: "galeria", figuras: [{ src: img[2].trim(), legenda: img[1].trim() }] });
      continue;
    }

    if (l.startsWith("### ")) { fecharLista(); blocos.push({ tipo: "subtitulo", texto: l.slice(4).trim() }); continue; }
    if (l.startsWith("## ")) { fecharLista(); blocos.push({ tipo: "titulo", texto: l.slice(3).trim() }); continue; }
    if (l.startsWith("> ")) { fecharLista(); blocos.push({ tipo: "citacao", texto: l.slice(2).trim() }); continue; }

    if (l.startsWith("@ ")) {
      fecharLista();
      const resto = l.slice(2);
      const corte = resto.indexOf("|");
      // Sem a barra, o marco é só o ano — a chamada é opcional.
      const ano = (corte >= 0 ? resto.slice(0, corte) : resto).trim();
      const chamada = corte >= 0 ? resto.slice(corte + 1).trim() : "";
      blocos.push({ tipo: "marco", ano, texto: chamada });
      continue;
    }

    if (l.startsWith("- ")) { lista.push(l.slice(2).trim()); continue; }

    fecharLista();
    blocos.push({ tipo: "paragrafo", texto: l });
  }

  fecharLista();
  // Galeria aberta e não fechada: publica assim mesmo, em vez de sumir com as
  // imagens por causa de um ":::" esquecido.
  if (galeria !== null && galeria.length > 0) blocos.push({ tipo: "galeria", figuras: galeria });

  return blocos;
}
