import Link from "next/link";
import Workspace from "@/components/Workspace";
import AgendaSemanal from "@/components/pessoas/AgendaSemanal";
import { AREAS, PONTO_DIGITAL_URL } from "@/lib/pessoas/conteudos";
import { TOTAL_PESSOAS } from "@/lib/pessoas/equipe";
import { appInitials } from "@/lib/modules";

export default function PessoasHome() {
  return (
    <Workspace moduleId="pessoas">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: "oklch(0.62 0.13 150)" }}>PE</div>
        <div>
          <h1>Pessoas</h1>
          <div className="desc">O espaço de quem faz a PHD — {TOTAL_PESSOAS} pessoas.</div>
        </div>
      </div>

      {/* Atalho externo: Ponto Digital */}
      <a className="destaque" href={PONTO_DIGITAL_URL} target="_blank" rel="noopener noreferrer">
        <span className="destaque-ic mono">PD</span>
        <span className="destaque-txt">
          <span className="destaque-nome">Ponto Digital</span>
          <span className="destaque-desc">Registre seu ponto pelo computador — abre o Coalize em nova aba.</span>
        </span>
        <span className="destaque-go mono">ABRIR ↗</span>
      </a>

      <AgendaSemanal />

      <div className="section-label mono" style={{ marginTop: 26 }}>Áreas · {AREAS.length}</div>
      <div className="app-grid">
        {AREAS.map((a) => (
          <Link key={a.id} href={`/m/pessoas/${a.id}`} className="app-card on">
            <div className="app-ic-sm mono" style={{ color: a.cor }}>{appInitials(a.titulo)}</div>
            <div className="nm">{a.titulo}</div>
            <div className="desc">{a.resumo}</div>
            <div className="go mono">ABRIR ›</div>
          </Link>
        ))}
      </div>
    </Workspace>
  );
}
