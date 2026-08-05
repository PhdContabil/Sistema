import Workspace from "@/components/Workspace";
import GanttMes, { type EventoAgenda } from "@/components/pessoas/GanttMes";
import { admin } from "@/lib/pessoas/ferias";
import { AGENDA_SEMANA, AGENDA_LEGENDA } from "@/lib/pessoas/conteudos";

export const dynamic = "force-dynamic";

const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export default async function AgendaMensal({
  searchParams,
}: {
  searchParams: { ano?: string; mes?: string };
}) {
  const hoje = new Date();
  const ano = Number(searchParams.ano) || hoje.getFullYear();
  const mes = Number(searchParams.mes) || hoje.getMonth() + 1;

  const diasNoMes = new Date(ano, mes, 0).getDate();
  const ini = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(diasNoMes).padStart(2, "0")}`;

  // Eventos reais (férias aprovadas, feriados, ausências…)
  let eventos: EventoAgenda[] = [];
  const sb = admin();
  if (sb) {
    const { data } = await sb
      .from("eventos_agenda")
      .select("id,tipo,titulo,inicio,fim,detalhe")
      .lte("inicio", fim)
      .gte("fim", ini)
      .order("inicio");
    eventos = (data ?? []) as EventoAgenda[];
  }

  const mesAnterior = mes === 1 ? { a: ano - 1, m: 12 } : { a: ano, m: mes - 1 };
  const mesSeguinte = mes === 12 ? { a: ano + 1, m: 1 } : { a: ano, m: mes + 1 };

  // Calendário do mês (marcações fixas da conteudos.ts continuam aparecendo)
  const porDia = new Map(AGENDA_SEMANA.map((d) => [d.data, d.marcas]));
  const cor = (s: string) => AGENDA_LEGENDA.find((l) => l.sigla === s)?.cor ?? "var(--muted)";
  const vazios = new Date(ano, mes - 1, 1).getDay();

  return (
    <Workspace moduleId="pessoas" appName="Agenda mensal">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: "oklch(0.62 0.13 150)" }}>AG</div>
        <div>
          <h1>Agenda mensal</h1>
          <div className="desc">Férias, ausências, feriados, emendas e reuniões do escritório.</div>
        </div>
      </div>

      <div className="toolbar">
        <a className="btn" href={`/m/pessoas/agenda?ano=${mesAnterior.a}&mes=${mesAnterior.m}`}>← {MESES[mesAnterior.m - 1]}</a>
        <strong style={{ fontSize: 15 }}>{MESES[mes - 1]} de {ano}</strong>
        <a className="btn" href={`/m/pessoas/agenda?ano=${mesSeguinte.a}&mes=${mesSeguinte.m}`}>{MESES[mesSeguinte.m - 1]} →</a>
        <span className="contador">{eventos.length} eventos</span>
      </div>

      {/* Linha do tempo (Gantt) */}
      <GanttMes eventos={eventos} ano={ano} mes={mes} />

      {/* Calendário do mês */}
      <div className="mes" style={{ marginTop: 20 }}>
        <div className="mes-grid mes-head">
          {DOW.map((d) => <div key={d} className="mes-dow mono">{d}</div>)}
        </div>
        <div className="mes-grid">
          {Array.from({ length: vazios }).map((_, i) => <div key={`v${i}`} className="mes-cel vazio" />)}
          {Array.from({ length: diasNoMes }).map((_, i) => {
            const dia = i + 1;
            const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
            const marcas = porDia.get(iso) ?? [];
            const doDia = eventos.filter((e) => e.inicio <= iso && e.fim >= iso);
            const fds = [0, 6].includes(new Date(ano, mes - 1, dia).getDay());
            return (
              <div key={iso} className={`mes-cel${fds ? " fds" : ""}`}>
                <div className="mes-num">{dia}</div>
                <div className="mes-marcas">
                  {marcas.map((mk, k) => (
                    <span key={`m${k}`} className="marca mono" style={{ background: cor(mk.sigla) }} title={mk.detalhe}>{mk.sigla}</span>
                  ))}
                  {doDia.slice(0, 3).map((e) => (
                    <span key={e.id} className="mes-evt" title={e.titulo}>{e.titulo}</span>
                  ))}
                  {doDia.length > 3 && <span className="mes-mais">+{doDia.length - 3}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="footnote">
        Férias aprovadas entram aqui automaticamente. Feriados, emendas e demais eventos podem ser
        cadastrados pelos encarregados numa próxima etapa.
      </p>
    </Workspace>
  );
}
