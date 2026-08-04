import Link from "next/link";
import { redirect } from "next/navigation";
import Workspace from "@/components/Workspace";
import { getArea } from "@/lib/pessoas/conteudos";
import { appInitials } from "@/lib/modules";

export default function AreaPage({ params }: { params: { area: string } }) {
  const a = getArea(params.area);
  if (!a) redirect("/m/pessoas");

  return (
    <Workspace moduleId="pessoas" appName={a.titulo}>
      <div className="app-head">
        <div className="app-ic mono" style={{ background: a.cor }}>{appInitials(a.titulo)}</div>
        <div>
          <h1>{a.titulo}</h1>
          <div className="desc">{a.resumo}</div>
        </div>
      </div>

      <div className="section-label mono">Tópicos · {a.secoes.length}</div>
      <div className="app-grid">
        {a.secoes.map((s) => (
          <Link key={s.id} href={`/m/pessoas/${a.id}/${s.id}`} className="app-card on">
            <div className="app-ic-sm mono" style={{ color: a.cor }}>{appInitials(s.titulo)}</div>
            <div className="nm">{s.titulo}</div>
            <div className="desc">{s.resumo}</div>
            {s.itens?.length ? (
              <div className="go mono">{s.itens.length} itens ›</div>
            ) : s.pendente ? (
              <span className="soon mono">Em elaboração</span>
            ) : (
              <div className="go mono">ABRIR ›</div>
            )}
          </Link>
        ))}
      </div>
    </Workspace>
  );
}
