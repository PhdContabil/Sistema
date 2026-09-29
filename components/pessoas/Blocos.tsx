import type { Bloco } from "@/lib/pessoas/conteudo-formato";

/** Texto com **negrito**. Sem ** o texto sai igual ao de antes. */
function Rico({ t }: { t: string }) {
  if (!t.includes("**")) return <>{t}</>;
  return <>{t.split("**").map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : p))}</>;
}

/**
 * Desenha os blocos de um texto institucional.
 *
 * Separado de <Conteudo> para o livro da História reaproveitar exatamente o
 * mesmo desenho dentro de cada página.
 */
export default function Blocos({ blocos, alt }: { blocos: Bloco[]; alt: string }) {
  return (
    <>
      {blocos.map((b, i) => {
        switch (b.tipo) {
          case "titulo":
            return <h2 key={i} className="ct-titulo">{b.texto}</h2>;
          case "subtitulo":
            return <h3 key={i} className="ct-subtitulo">{b.texto}</h3>;
          case "marco":
            return (
              <div key={i} className="ct-marco">
                <span className="ct-marco-ano mono">{b.ano}</span>
                {b.texto && <span className="ct-marco-chamada">{b.texto}</span>}
              </div>
            );
          case "citacao":
            return <blockquote key={i} className="ct-citacao"><Rico t={b.texto} /></blockquote>;
          case "lista":
            return (
              <ul key={i} className="ct-lista">
                {b.itens.map((it, j) => <li key={j}><Rico t={it} /></li>)}
              </ul>
            );
          case "galeria":
            return (
              <div key={i} className={`ct-galeria ${b.figuras.length === 1 ? "unica" : ""}`}>
                {b.figuras.map((f, j) => (
                  // Foto e logomarca se comportam de formas opostas: a logo é
                  // alinhada pela altura (proporções diferentes entre si), a
                  // foto cresce para ocupar a coluna.
                  <figure key={j} className={/\.jpe?g$/i.test(f.src) ? "foto" : ""}>
                    {/* <img> puro, e não next/image: arquivos estáticos de
                        proporções diferentes, que o next/image exigiria com
                        width/height fixos um a um. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.src} alt={f.legenda || alt} loading="lazy" />
                    {f.legenda && <figcaption>{f.legenda}</figcaption>}
                  </figure>
                ))}
              </div>
            );
          case "tabela":
            return (
              <div key={i} className="ct-tabela-wrap">
                <table className="ct-tabela">
                  <thead><tr>{b.cabecalho.map((c, j) => <th key={j}><Rico t={c} /></th>)}</tr></thead>
                  <tbody>
                    {b.linhas.map((l, j) => <tr key={j}>{l.map((c, k) => <td key={k}><Rico t={c} /></td>)}</tr>)}
                  </tbody>
                </table>
              </div>
            );
          default:
            return <p key={i}><Rico t={b.texto} /></p>;
        }
      })}
    </>
  );
}
