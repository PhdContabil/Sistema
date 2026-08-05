"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  dataBR, diasEntre, ROTULO_STATUS, CLASSE_STATUS,
  type SolicitacaoFerias, type StatusFerias,
} from "@/lib/pessoas/ferias";

export default function Aprovacoes({
  pendentes, historico,
}: {
  pendentes: SolicitacaoFerias[];
  historico: SolicitacaoFerias[];
}) {
  const router = useRouter();
  const [processando, setProcessando] = useState<number | null>(null);
  const [recusando, setRecusando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function decidir(id: number, acao: "aprovar" | "rejeitar", motivoTexto?: string) {
    setProcessando(id); setErro(null); setMsg(null);
    try {
      const r = await fetch(`/api/pessoas/ferias/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, motivo: motivoTexto }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Falha ao registrar.");
      setMsg(acao === "aprovar"
        ? "Férias aprovadas. O colaborador foi avisado por e-mail e Teams, e o período entrou na agenda."
        : "Solicitação recusada. O colaborador foi avisado por e-mail e Teams.");
      setRecusando(null); setMotivo("");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro.");
    } finally {
      setProcessando(null);
    }
  }

  return (
    <>
      {msg && <div className="banner">{msg}</div>}
      {erro && <div className="banner error">{erro}</div>}

      <div className="summary">
        <div className="card"><div className="k">Aguardando você</div><div className="v num" style={{ color: "#b45309" }}>{pendentes.length}</div></div>
      </div>

      <section className="bloco-edit">
        <h3>Solicitações pendentes</h3>
        {pendentes.length === 0 ? (
          <p className="vazio">Nenhuma solicitação aguardando aprovação.</p>
        ) : (
          <div className="lista-aprov">
            {pendentes.map((s) => {
              const dias = (s.periodos ?? []).reduce((t, p) => t + diasEntre(p.inicio, p.fim), 0);
              return (
                <article key={s.id} className="card-aprov">
                  <div className="ca-topo">
                    <div>
                      <div className="ca-nome">{s.pessoa_nome ?? s.solicitante}</div>
                      <div className="ca-setor">{s.setor} · pedido em {dataBR(s.criado_em.slice(0, 10))}</div>
                    </div>
                    <span className="dias-badge">{dias} dias</span>
                  </div>

                  <div className="ca-periodos">
                    {(s.periodos ?? []).map((p, i) => (
                      <span key={i} className="periodo-chip">
                        {dataBR(p.inicio)} → {dataBR(p.fim)} <em>({diasEntre(p.inicio, p.fim)}d)</em>
                      </span>
                    ))}
                  </div>

                  {s.observacao && <p className="ca-obs">“{s.observacao}”</p>}

                  {recusando === s.id ? (
                    <div className="ca-recusa">
                      <input
                        className="search" autoFocus placeholder="Motivo da recusa (o colaborador verá)"
                        value={motivo} onChange={(e) => setMotivo(e.target.value)}
                      />
                      <button className="btn" onClick={() => { setRecusando(null); setMotivo(""); }}>Voltar</button>
                      <button className="btn btn-recusar" disabled={processando === s.id} onClick={() => decidir(s.id, "rejeitar", motivo)}>
                        Confirmar recusa
                      </button>
                    </div>
                  ) : (
                    <div className="ca-acoes">
                      <button className="btn primary" disabled={processando === s.id} onClick={() => decidir(s.id, "aprovar")}>
                        {processando === s.id ? "Processando…" : "✓ Aprovar"}
                      </button>
                      <button className="btn btn-recusar" disabled={processando === s.id} onClick={() => setRecusando(s.id)}>
                        ✕ Recusar
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="bloco-edit" style={{ marginTop: 18 }}>
        <h3>Histórico</h3>
        {historico.length === 0 ? (
          <p className="vazio">Nada avaliado ainda.</p>
        ) : (
          <div className="table-wrap" style={{ boxShadow: "none" }}>
            <table className="grid">
              <thead>
                <tr>
                  <th className="col-empresa">Colaborador</th>
                  <th>Período</th>
                  <th className="c-res">Situação</th>
                  <th>Avaliado por</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((s) => (
                  <tr key={s.id}>
                    <td className="col-empresa">
                      <span className="emp-nome">{s.pessoa_nome ?? s.solicitante}</span>
                      <span className="cnpj">{s.setor}</span>
                      {s.motivo_recusa && <span className="obs obs-div">Motivo: {s.motivo_recusa}</span>}
                    </td>
                    <td>{(s.periodos ?? []).map((p) => `${dataBR(p.inicio)}–${dataBR(p.fim)}`).join(" · ")}</td>
                    <td className="c-res">
                      <span className={`badge ${CLASSE_STATUS[s.status as StatusFerias]}`}>{ROTULO_STATUS[s.status as StatusFerias]}</span>
                    </td>
                    <td className="mut">{s.aprovador ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
