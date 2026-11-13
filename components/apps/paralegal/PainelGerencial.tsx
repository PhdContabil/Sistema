"use client";
// Painel Gerencial do Paralegal — só desenha o que a página calculou no servidor.
import { Fragment, useMemo, useState } from "react";
import type { Alerta, LinhaResponsavel, ProcessoPainel, Resumo } from "@/lib/paralegal/painel";

const ROTULO: Record<Alerta, string> = {
  atrasado: "Atrasado", vence_2d: "Vence em até 2 dias", vence_7d: "Vence em até 7 dias",
  em_dia: "Em dia", backlog: "Atraso antigo", sem_pendencia: "Pronto para concluir", sem_checklist: "Sem checklist",
};
const ORDEM: Alerta[] = ["atrasado", "vence_2d", "vence_7d", "em_dia", "sem_pendencia", "backlog", "sem_checklist"];

function dataBR(d: string | null): string {
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—";
}
function quando(dias: number | null): string {
  if (dias === null) return "sem prazo";
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  if (dias > 0) return `em ${dias} dias`;
  return `${-dias} dia${dias === -1 ? "" : "s"} de atraso`;
}

export default function PainelGerencial({ hoje, processos, resumo, responsaveis, status }: {
  hoje: string; processos: ProcessoPainel[]; resumo: Resumo; responsaveis: LinhaResponsavel[]; status: { status: string; total: number }[];
}) {
  const [alerta, setAlerta] = useState<Alerta | "todos">("todos");
  const [resp, setResp] = useState("");
  const [st, setSt] = useState("");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<number | null>(null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return processos
      .filter((p) => (alerta === "todos" || p.alerta === alerta) && (!resp || p.responsavel === resp) && (!st || p.status === st) && (!q || p.nome.toLowerCase().includes(q)))
      .sort((a, b) => ORDEM.indexOf(a.alerta) - ORDEM.indexOf(b.alerta) || b.falta - a.falta || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [processos, alerta, resp, st, busca]);

  const cards: { k: Alerta | "todos"; rot: string; v: number }[] = [
    { k: "todos", rot: "Processos ativos", v: resumo.ativos },
    { k: "atrasado", rot: "Atrasados", v: resumo.atrasados },
    { k: "vence_2d", rot: "Vencem em 2 dias", v: resumo.vence2d },
    { k: "vence_7d", rot: "Vencem em 7 dias", v: resumo.vence7d },
    { k: "sem_pendencia", rot: "Prontos para concluir", v: resumo.prontos },
  ];

  return (
    <div className="pg">
      <div className="pg-nota">Atualizado em {dataBR(hoje)}. Atrasos de mais de 30 dias ficam como “atraso antigo” e não entram nos alertas. {resumo.faltam} atividades ainda faltam no total.</div>

      <div className="pg-cards">
        {cards.map((c) => (
          <button key={c.k} className={`pg-card ${c.k} ${alerta === c.k ? "on" : ""}`} onClick={() => setAlerta(alerta === c.k ? "todos" : c.k)}>
            <span className="pg-k">{c.rot}</span><span className="pg-v">{c.v}</span>
          </button>
        ))}
      </div>

      <div className="pg-bloco">
        <h2>Por responsável</h2>
        <div className="pg-tabela-wrap">
          <table className="pg-tabela">
            <thead><tr><th>Responsável</th><th>Processos</th><th>Atividades que faltam</th><th>Atrasados</th><th>Vencem 2d</th><th>Vencem 7d</th></tr></thead>
            <tbody>
              {responsaveis.map((r) => (
                <tr key={r.responsavel} className="clicavel" onClick={() => setResp(resp === r.responsavel ? "" : r.responsavel)}>
                  <td><b>{r.responsavel}</b></td><td>{r.processos}</td><td>{r.faltam}</td>
                  <td className={r.atrasado ? "pg-ruim" : ""}>{r.atrasado}</td><td>{r.vence2d}</td><td>{r.vence7d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pg-bloco">
        <h2>Processos <span className="pg-cont">{lista.length}</span></h2>
        <div className="pg-filtros">
          <input placeholder="Buscar empresa" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <select value={resp} onChange={(e) => setResp(e.target.value)}>
            <option value="">Todos os responsáveis</option>
            {responsaveis.map((r) => <option key={r.responsavel}>{r.responsavel}</option>)}
          </select>
          <select value={st} onChange={(e) => setSt(e.target.value)}>
            <option value="">Todos os status</option>
            {status.map((s) => <option key={s.status} value={s.status}>{s.status} ({s.total})</option>)}
          </select>
          {(alerta !== "todos" || resp || st || busca) && <button className="btn" onClick={() => { setAlerta("todos"); setResp(""); setSt(""); setBusca(""); }}>Limpar filtros</button>}
        </div>
        <div className="pg-tabela-wrap">
          <table className="pg-tabela">
            <thead><tr><th>Empresa</th><th>Responsável</th><th>Status</th><th>Onde está</th><th>Andamento</th><th>Alerta</th></tr></thead>
            <tbody>
              {lista.map((p) => (
                <Fragment key={p.id}>
                  <tr className="clicavel" onClick={() => setAberto(aberto === p.id ? null : p.id)}>
                    <td><b>{p.nome}</b></td>
                    <td>{p.responsavel}</td>
                    <td>{p.status}</td>
                    <td>
                      {p.etapaManual && <div className="pg-manual">{p.etapaManual}</div>}
                      <div>{p.etapaAtual}</div>
                      {p.etapaPrazo && <div className="pg-peq">prazo {dataBR(p.etapaPrazo)}</div>}
                    </td>
                    <td>
                      <div className="pg-barra"><i style={{ width: `${p.feitas + p.falta ? Math.round((100 * p.feitas) / (p.feitas + p.falta)) : 0}%` }} /></div>
                      <div className="pg-peq">{p.feitas} feitas · {p.falta} faltam</div>
                    </td>
                    <td><span className={`pg-tag ${p.alerta}`}>{ROTULO[p.alerta]}</span></td>
                  </tr>
                  {aberto === p.id && (
                    <tr className="pg-det"><td colSpan={6}>
                      {p.abertas.length === 0 ? <i>Nenhuma atividade em aberto.</i> : (
                        <table className="pg-tabela interna">
                          <thead><tr><th>Etapa</th><th>Atividade</th><th>Responsável</th><th>Situação</th><th>Prazo</th></tr></thead>
                          <tbody>{p.abertas.map((a) => (
                            <tr key={a.id}><td>{a.ordem}</td><td>{a.nome}</td><td>{a.responsavel}</td><td>{a.situacao}</td>
                              <td className={a.categoria === "atrasada" ? "pg-ruim" : ""}>{dataBR(a.prazo)} <span className="pg-peq">({quando(a.dias)})</span></td></tr>
                          ))}</tbody>
                        </table>
                      )}
                    </td></tr>
                  )}
                </Fragment>
              ))}
              {lista.length === 0 && <tr><td colSpan={6} className="pg-vazio">Nenhum processo nesse filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
