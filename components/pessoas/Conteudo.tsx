import type { Secao } from "@/lib/pessoas/conteudos";

/** Renderiza o texto de uma seção, ou o aviso de conteúdo em elaboração. */
export default function Conteudo({ secao }: { secao: Secao }) {
  const paragrafos = (secao.texto ?? "").split("\n\n").filter(Boolean);

  return (
    <div className="conteudo">
      {paragrafos.map((p, i) => (
        <p key={i}>{p}</p>
      ))}

      {secao.pendente && (
        <div className="pendente">
          <strong>Conteúdo em elaboração.</strong>
          {secao.nota ? ` ${secao.nota}` : " O texto definitivo será publicado em breve."}
        </div>
      )}
    </div>
  );
}
