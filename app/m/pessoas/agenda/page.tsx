import Workspace from "@/components/Workspace";
import { AGENDA_SEMANA, AGENDA_LEGENDA } from "@/lib/pessoas/conteudos";

const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export default function AgendaMensal() {
  // Mês de referência: o da primeira marcação cadastrada.
  const base = AGENDA_SEMANA[0]?.data ?? new Date().toISOString().slice(0, 10);
  const [ay, am] = base.split("-").map(Number);
  const primeiro = new Date(ay, am - 1, 1);
  const diasNoMes = new Date(ay, am, 0).getDate();
  const vazios = primeiro.getDay();

  const porDia = new Map(AGENDA_SEMANA.map((d) => [d.data, d.marcas]));
  const cor = (s: string) => AGENDA_LEGENDA.find((l) => l.sigla === s)?.cor ?? "var(--muted)";

  return (
    <Workspace moduleId="pessoas" appName="Agenda mensal">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: "oklch(0.62 0.13 150)" }}>AG</div>
        <div>
          <h1>Agenda mensal</h1>
          <div className="desc">{MESES[am - 1]} de {ay} — férias, reuniões, aniversários e confraternizações.</div>
        </div>
      </div>

      <div className="mes">
        <div className="mes-grid mes-head">
          {DOW.map((d) => <div key={d} className="mes-dow mono">{d}</div>)}
        </div>
        <div className="mes-grid">
          {Array.from({ length: vazios }).map((_, i) => <div key={`v${i}`} className="mes-cel vazio" />)}
          {Array.from({ length: diasNoMes }).map((_, i) => {
            const dia = i + 1;
            const iso = `${ay}-${String(am).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
            const marcas = porDia.get(iso) ?? [];
            const fds = [0, 6].includes(new Date(ay, am - 1, dia).getDay());
            return (
              <div key={iso} className={`mes-cel${fds ? " fds" : ""}`}>
                <div className="mes-num">{dia}</div>
                <div className="mes-marcas">
                  {marcas.map((mk, k) => (
                    <span key={k} className="marca mono" style={{ background: cor(mk.sigla) }} title={mk.detalhe}>{mk.sigla}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="agenda-legenda" style={{ marginTop: 16 }}>
        {AGENDA_LEGENDA.map((l) => (
          <span key={l.sigla} className="lg">
            <span className="marca mono" style={{ background: l.cor }}>{l.sigla}</span>{l.rotulo}
          </span>
        ))}
      </div>

      <p className="footnote">As marcações são cadastradas em <code>lib/pessoas/conteudos.ts</code> (AGENDA_SEMANA). Numa próxima etapa isso passa para o banco, com cadastro pela tela.</p>
    </Workspace>
  );
}
