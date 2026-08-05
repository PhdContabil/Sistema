"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  dataBR, diasEntre, ROTULO_STATUS, CLASSE_STATUS,
  type SolicitacaoFerias, type StatusFerias,
} from "@/lib/pessoas/ferias";

interface Linha { inicio: string; fim: string }

export default function MinhasFerias({
  perfil, chefe, ehEncarregado, inicial,
}: {
  perfil: { id: number; nome: string; setor: string };
  chefe: { nome: string; email: string } | null;
  ehEncarregado: boolean;
  inicial: SolicitacaoFerias[];
}) {
  const router = useRouter();
  const [periodos, setPeriodos] = useState<Linha[]>([{ inicio: "", fim: "" }]);
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const totalDias = periodos
    .filter((p) => p.inicio && p.fim && p.fim >= p.inicio)
    .reduce((s, p) => s + diasEntre(p.inicio, p.fim), 0);

  function atualizar(i: number, campo: keyof Linha, valor: string) {
    setPeriodos((ps) => ps.map((p, k) => (k === i ? { ...p, [campo]: valor } : p)));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null); setMsg(null);
    const validos = periodos.filter((p) => p.inicio && p.fim);
    if (validos.length === 0) { setErro("Informe ao menos um período."); return; }
    if (validos.some((p) => p.fim < p.inicio)) { setErro("A data final não pode ser anterior à inicial."); return; }

    setEnviando(true);
    try {
      const r = await fetch("/api/pessoas/ferias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodos: validos, observacao }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Falha ao enviar.");
      setMsg(`Solicitação enviada${j.encarregado ? ` para ${j.encarregado}` : ""}. Você será avisado por e-mail e Teams.`);
      setPeriodos([{ inicio: "", fim: "" }]);
      setObservacao("");
      router.refresh();
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Erro ao enviar.");
    } finally {
      setEnviando(false);
    }
  }

  async function cancelar(id: number) {
    setErro(null);
    const r = await fetch(`/api/pessoas/ferias/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "cancelar" }),
    });
    const j = await r.json();
    if (!r.ok || j.error) setErro(j.error || "Não foi possível cancelar.");
    else router.refresh();
  }

  return (
    <>
      {ehEncarregado && (
        <div className="banner">
          Você é encarregado do <strong>{perfil.setor}</strong>.{" "}
          <Link href="/m/pessoas/ferias/aprovacoes">Ver solicitações para aprovar →</Link>
        </div>
      )}
      {msg && <div className="banner">{msg}</div>}
      {erro && <div className="banner error">{erro}</div>}

      <section className="bloco-edit">
        <h3>Solicitar férias</h3>
        <p className="sub-info">
          Informe o período desejado. Você pode pedir <strong>dois períodos</strong> no ano.
          {chefe && <> A aprovação é de <strong>{chefe.nome}</strong>.</>}
        </p>

        <form onSubmit={enviar}>
          {periodos.map((p, i) => (
            <div className="linha-add" key={i}>
              <label className="campo-inline">
                <span>Início</span>
                <input className="search" type="date" value={p.inicio} onChange={(e) => atualizar(i, "inicio", e.target.value)} />
              </label>
              <label className="campo-inline">
                <span>Fim</span>
                <input className="search" type="date" value={p.fim} onChange={(e) => atualizar(i, "fim", e.target.value)} />
              </label>
              <span className="dias-badge">
                {p.inicio && p.fim && p.fim >= p.inicio ? `${diasEntre(p.inicio, p.fim)} dias` : "—"}
              </span>
              {periodos.length > 1 && (
                <button type="button" className="btn-remover" onClick={() => setPeriodos((ps) => ps.filter((_, k) => k !== i))}>✕</button>
              )}
            </div>
          ))}

          {periodos.length < 2 && (
            <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => setPeriodos((ps) => [...ps, { inicio: "", fim: "" }])}>
              + Adicionar segundo período
            </button>
          )}

          <label className="campo" style={{ marginTop: 14 }}>
            <span>Observação (opcional)</span>
            <textarea rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Algo que o encarregado precise saber." />
          </label>

          <div className="fp-acoes" style={{ marginTop: 14 }}>
            <button className="btn primary" type="submit" disabled={enviando}>
              {enviando ? "Enviando…" : "Enviar solicitação"}
            </button>
            {totalDias > 0 && <span className="sub-info">Total: <strong>{totalDias} dias</strong></span>}
          </div>
        </form>
      </section>

      <section className="bloco-edit" style={{ marginTop: 18 }}>
        <h3>Minhas solicitações</h3>
        {inicial.length === 0 ? (
          <p className="vazio">Você ainda não solicitou férias.</p>
        ) : (
          <div className="table-wrap" style={{ boxShadow: "none" }}>
            <table className="grid">
              <thead>
                <tr>
                  <th className="col-empresa">Período</th>
                  <th className="c-res">Dias</th>
                  <th className="c-res">Situação</th>
                  <th>Avaliação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {inicial.map((s) => {
                  const dias = (s.periodos ?? []).reduce((t, p) => t + diasEntre(p.inicio, p.fim), 0);
                  return (
                    <tr key={s.id}>
                      <td className="col-empresa">
                        <span className="emp-nome">
                          {(s.periodos ?? []).map((p) => `${dataBR(p.inicio)} a ${dataBR(p.fim)}`).join(" · ")}
                        </span>
                        {s.observacao && <span className="obs">{s.observacao}</span>}
                        {s.motivo_recusa && <span className="obs obs-div">Motivo: {s.motivo_recusa}</span>}
                      </td>
                      <td className="c-res num">{dias}</td>
                      <td className="c-res">
                        <span className={`badge ${CLASSE_STATUS[s.status as StatusFerias]}`}>
                          {ROTULO_STATUS[s.status as StatusFerias]}
                        </span>
                      </td>
                      <td className="mut">{s.aprovador ?? <span className="dash">–</span>}</td>
                      <td className="c-res">
                        {s.status === "pendente" && (
                          <button className="btn-remover" onClick={() => cancelar(s.id)} title="Cancelar">✕</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
