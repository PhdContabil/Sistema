import Link from "next/link";
import { redirect } from "next/navigation";
import { getModule } from "@/lib/modules";
import Workspace from "@/components/Workspace";
import AppIcon from "@/components/AppIcon";
import ModuloIcon from "@/components/ModuloIcon";

export default function ModuloPage({ params }: { params: { modulo: string } }) {
  const m = getModule(params.modulo);
  if (!m) redirect("/");

  return (
    <Workspace moduleId={m.id}>
      <div className="app-head">
        <div className="app-ic" style={{ background: m.color }}><ModuloIcon id={m.id} /></div>
        <div>
          <h1>{m.name}</h1>
          <div className="desc">{m.desc}</div>
        </div>
      </div>

      <div className="section-label mono">Aplicações · {m.apps.length}</div>
      <div className="app-grid">
        {m.apps.map((a) => {
          const inner = (
            <>
              <div className="app-ic-sm" style={{ color: m.color }}><AppIcon nome={a.name} /></div>
              <div className="nm">{a.name}</div>
              <div className="desc">{a.desc}</div>
              {a.href ? <div className="go mono">ABRIR ›</div> : <span className="soon mono">Em breve</span>}
            </>
          );
          return a.href ? (
            <Link key={a.name} href={a.href} className="app-card on" style={{ ["--card-accent" as string]: m.color }}>
              {inner}
            </Link>
          ) : (
            <div key={a.name} className="app-card off">{inner}</div>
          );
        })}
      </div>
    </Workspace>
  );
}
