import type { Secao } from "@/lib/pessoas/conteudos";
import { blocosDoTexto } from "@/lib/pessoas/conteudo-formato";

/** Renderiza o texto de uma seção, ou o aviso de conteúdo em elaboração. */
export default function Conteudo({ secao }: { secao: Secao }) {
  const blocos = blocosDoTexto(secao.texto);

  return (
    <div className="conteudo">
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
            return <blockquote key={i} className="ct-citacao">{b.texto}</blockquote>;
          case "lista":
            return (
              <ul key={i} className="ct-lista">
                {b.itens.map((it, j) => <li key={j}>{it}</li>)}
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
                    {/* <img> puro, e não next/image: são arquivos estáticos de
                        tamanho conhecido, e o componente do Next exigiria
                        width/height fixos para cada logo de proporção diferente. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.src} alt={f.legenda || secao.titulo} loading="lazy" />
                    {f.legenda && <figcaption>{f.legenda}</figcaption>}
                  </figure>
                ))}
              </div>
            );
          default:
            return <p key={i}>{b.texto}</p>;
        }
      })}

      {secao.anexos?.length ? (
        <div className="ct-anexos">
          <div className="section-label mono">Para baixar</div>
          {secao.anexos.map((a) => (
            <a key={a.href} className="ct-anexo" href={a.href} target="_blank" rel="noopener noreferrer">
              <span className="ct-anexo-ic mono">{a.formato ?? "PDF"}</span>
              <span className="ct-anexo-txt">
                <strong>{a.titulo}</strong>
                {a.descricao && <span className="desc">{a.descricao}</span>}
              </span>
              <span className="ct-anexo-seta" aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      ) : null}

      {secao.pendente && (
        <div className="pendente">
          <strong>Conteúdo em elaboração.</strong>
          {secao.nota ? ` ${secao.nota}` : " O texto definitivo será publicado em breve."}
        </div>
      )}
    </div>
  );
}
