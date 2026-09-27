import type { Secao } from "@/lib/pessoas/conteudos";
import { blocosDoTexto } from "@/lib/pessoas/conteudo-formato";
import Blocos from "./Blocos";

/** Renderiza o texto de uma seção, ou o aviso de conteúdo em elaboração. */
export default function Conteudo({ secao }: { secao: Secao }) {
  return (
    <div className="conteudo">
      <Blocos blocos={blocosDoTexto(secao.texto)} alt={secao.titulo} />

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
