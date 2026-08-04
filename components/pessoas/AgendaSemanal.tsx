import { AGENDA_SEMANA, AGENDA_LEGENDA } from "@/lib/pessoas/conteudos";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function corDa(sigla: string) {
  return AGENDA_LEGENDA.find((l) => l.sigla === sigla)?.cor ?? "var(--muted)";
}

export default function AgendaSemanal() {
  return (
    <section className="agenda">
      <div className="agenda-head">
        <h2 className="bloco-titulo">Agenda semanal</h2>
        <span className="agenda-nota">Passe o mouse nas marcações para ver os detalhes</span>
      </div>

      <div className="agenda-grid">
        {AGENDA_SEMANA.map((d) => {
          const [a, m, dia] = d.data.split("-");
          const date = new Date(Number(a), Number(m) - 1, Number(dia));
          return (
            <div key={d.data} className="agenda-dia">
              <div className="agenda-dow mono">{DIAS[date.getDay()]}</div>
              <div className="agenda-num">{dia}</div>
              <div className="agenda-marcas">
                {d.marcas.map((mk, i) => (
                  <span key={i} className="marca mono" style={{ background: corDa(mk.sigla) }} title={mk.detalhe}>
                    {mk.sigla}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="agenda-legenda">
        {AGENDA_LEGENDA.map((l) => (
          <span key={l.sigla} className="lg">
            <span className="marca mono" style={{ background: l.cor }}>{l.sigla}</span>
            {l.rotulo}
          </span>
        ))}
      </div>
    </section>
  );
}
