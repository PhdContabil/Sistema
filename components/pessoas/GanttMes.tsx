"use client";

import { useMemo, useState } from "react";

export interface EventoAgenda {
  id: number;
  tipo: string;
  titulo: string;
  inicio: string;
  fim: string;
  detalhe: string | null;
  pessoa_nome?: string | null;
}

const CORES: Record<string, { cor: string; rotulo: string }> = {
  ferias:          { cor: "#16a34a", rotulo: "Férias" },
  ausencia:        { cor: "#f59e0b", rotulo: "Ausência" },
  licenca:         { cor: "#eab308", rotulo: "Licença B.H." },
  feriado:         { cor: "#dc2626", rotulo: "Feriado" },
  emenda:          { cor: "#0ea5e9", rotulo: "Emenda" },
  reuniao:         { cor: "#0f766e", rotulo: "Reunião" },
  aniversario:     { cor: "#8b5cf6", rotulo: "Aniversário" },
  confraternizacao:{ cor: "#ec4899", rotulo: "Confraternização" },
  outro:           { cor: "#64748b", rotulo: "Outro" },
};

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export default function GanttMes({ eventos, ano, mes }: { eventos: EventoAgenda[]; ano: number; mes: number }) {
  const [tipoSel, setTipoSel] = useState<string>("todos");

  const diasNoMes = new Date(ano, mes, 0).getDate();
  const primeiroDia = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ultimoDia = `${ano}-${String(mes).padStart(2, "0")}-${String(diasNoMes).padStart(2, "0")}`;

  const doMes = useMemo(
    () => eventos
      .filter((e) => e.fim >= primeiroDia && e.inicio <= ultimoDia)
      .filter((e) => tipoSel === "todos" || e.tipo === tipoSel),
    [eventos, primeiroDia, ultimoDia, tipoSel]
  );

  const tiposPresentes = useMemo(() => {
    const s = new Set(eventos.filter((e) => e.fim >= primeiroDia && e.inicio <= ultimoDia).map((e) => e.tipo));
    return Array.from(s);
  }, [eventos, primeiroDia, ultimoDia]);

  function faixa(e: EventoAgenda) {
    const ini = e.inicio < primeiroDia ? 1 : Number(e.inicio.slice(8, 10));
    const fim = e.fim > ultimoDia ? diasNoMes : Number(e.fim.slice(8, 10));
    return { ini, fim, span: Math.max(1, fim - ini + 1) };
  }

  const hoje = new Date();
  const diaHoje = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes ? hoje.getDate() : null;

  return (
    <section className="gantt">
      <div className="gantt-topo">
        <h2 className="bloco-titulo">Linha do tempo — {MESES[mes - 1]} de {ano}</h2>
        <div className="gantt-filtros">
          <span className={`chip ${tipoSel === "todos" ? "on" : ""}`} onClick={() => setTipoSel("todos")}>Todos</span>
          {tiposPresentes.map((t) => (
            <span key={t} className={`chip ${tipoSel === t ? "on" : ""}`} onClick={() => setTipoSel(t)}>
              {CORES[t]?.rotulo ?? t}
            </span>
          ))}
        </div>
      </div>

      {doMes.length === 0 ? (
        <p className="vazio" style={{ padding: "18px 0" }}>Nenhum evento neste mês.</p>
      ) : (
        <div className="gantt-wrap">
          <table className="gantt-tab">
            <thead>
              <tr>
                <th className="g-nome">Evento</th>
                {Array.from({ length: diasNoMes }).map((_, i) => {
                  const d = i + 1;
                  const dow = new Date(ano, mes - 1, d).getDay();
                  const fds = dow === 0 || dow === 6;
                  return (
                    <th key={d} className={`g-dia${fds ? " fds" : ""}${d === diaHoje ? " hoje" : ""}`}>{d}</th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {doMes.map((e) => {
                const { ini, span } = faixa(e);
                const cor = CORES[e.tipo]?.cor ?? "#64748b";
                return (
                  <tr key={e.id}>
                    <td className="g-nome">
                      <span className="g-ponto" style={{ background: cor }} />
                      <span className="g-titulo">{e.titulo}</span>
                      {e.detalhe && <span className="g-detalhe">{e.detalhe}</span>}
                    </td>
                    {Array.from({ length: diasNoMes }).map((_, i) => {
                      const d = i + 1;
                      if (d === ini) {
                        return (
                          <td key={d} colSpan={span} className="g-barra-cel">
                            <span className="g-barra" style={{ background: cor }} title={`${e.titulo} — ${e.inicio} a ${e.fim}`}>
                              {span >= 3 ? `${span}d` : ""}
                            </span>
                          </td>
                        );
                      }
                      if (d > ini && d < ini + span) return null;
                      const dow = new Date(ano, mes - 1, d).getDay();
                      const fds = dow === 0 || dow === 6;
                      return <td key={d} className={`g-cel${fds ? " fds" : ""}${d === diaHoje ? " hoje" : ""}`} />;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="agenda-legenda" style={{ marginTop: 14 }}>
        {Object.entries(CORES)
          .filter(([t]) => tiposPresentes.includes(t))
          .map(([t, v]) => (
            <span key={t} className="lg"><span className="g-ponto" style={{ background: v.cor }} />{v.rotulo}</span>
          ))}
      </div>
    </section>
  );
}
