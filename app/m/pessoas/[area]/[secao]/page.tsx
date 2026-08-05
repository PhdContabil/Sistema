import { redirect } from "next/navigation";
import Workspace from "@/components/Workspace";
import Conteudo from "@/components/pessoas/Conteudo";
import Hierarquia from "@/components/pessoas/Hierarquia";
import Equipe from "@/components/pessoas/Equipe";
import { getArea, getSecao } from "@/lib/pessoas/conteudos";
import { appInitials } from "@/lib/modules";

export default function SecaoPage({ params }: { params: { area: string; secao: string } }) {
  const a = getArea(params.area);
  const s = a ? getSecao(a.id, params.secao) : undefined;
  if (!a || !s) redirect("/m/pessoas");

  return (
    <Workspace moduleId="pessoas" appName={`${a.titulo} › ${s.titulo}`}>
      <div className="app-head">
        <div className="app-ic mono" style={{ background: a.cor }}>{appInitials(s.titulo)}</div>
        <div>
          <h1>{s.titulo}</h1>
          <div className="desc">{s.resumo}</div>
        </div>
      </div>

      {s.especial === "hierarquia" && <Hierarquia />}
      {s.especial === "pessoas" && <Equipe />}

      {/* Terceiro nível: sub-itens */}
      {s.itens?.length ? (
        <>
          <div className="section-label mono">Itens · {s.itens.length}</div>
          <div className="sub-lista">
            {s.itens.map((it) => (
              <article key={it.id} className="sub-item">
                <div className="sub-head">
                  <span className="sub-ic mono" style={{ color: a.cor }}>{appInitials(it.titulo)}</span>
                  <div>
                    <div className="sub-nome">{it.titulo}</div>
                    <div className="sub-desc">{it.resumo}</div>
                  </div>
                </div>
                <Conteudo secao={it} />
              </article>
            ))}
          </div>
        </>
      ) : (
        !s.especial && <Conteudo secao={s} />
      )}

    </Workspace>
  );
}
