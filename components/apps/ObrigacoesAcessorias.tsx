"use client";

import { useEffect, useMemo, useState } from "react";
import {
  OBRIGACOES_SUGESTAO,
  STATUS_OBRIGACAO,
  type ObrigacaoAcessoria,
  type NovaObrigacaoAcessoria,
} from "@/lib/obrigacoes-acessorias";

function Badge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cor = s === "entregue" ? "var(--ok)" : s === "atrasada" ? "var(--div)" : "var(--muted)";
  return (
    <span className="badge" style={{ background: `color-mix(in srgb, ${cor} 15%, var(--surface))`, color: cor, fontWeight: 600 }}>
      {status}
    </span>
  );
}

const VAZIO: NovaObrigacaoAcessoria = {
  empresa: "",
  obrigacao: "",
  competencia: "",
  vencimento: null,
  status: "Pendente",
  responsavel: null,
  observacao: null,
};

export default function ObrigacoesAcessorias() {
  const [itens, setItens] = useState<ObrigacaoAcessoria[] | null>(null);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [modal, setModal] = useState<{ id: number | null; form: NovaObrigacaoAcessoria } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    const r = await fetch("/api/obrigacoes-acessorias", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setItens(j.itens ?? []);
    else setErro(j.error ?? "Não foi possível carregar as obrigações.");
  }

  useEffect(() => {
    carregar();
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (itens ?? []).filter((i) => {
      if (statusFiltro && i.status !== statusFiltro) return false;
      if (!q) return true;
      return [i.empresa, i.obrigacao, i.competencia, i.responsavel, i.observacao].filter(Boolean).some((v) => v!.toLowerCase().includes(q));
    });
  }, [itens, busca, statusFiltro]);

  const resumo = useMemo(() => {
    const lista = itens ?? [];
    return {
      total: lista.length,
      atrasadas: lista.filter((i) => i.status === "Atrasada").length,
      pendentes: lista.filter((i) => i.status === "Pendente").length,
    };
  }, [itens]);

  function abrirNovo() {
    setErro(null);
    setModal({ id: null, form: VAZIO });
  }

  function abrirEdicao(i: ObrigacaoAcessoria) {
    setErro(null);
    setModal({
      id: i.id,
      form: {
        empresa: i.empresa,
        obrigacao: i.obrigacao,
        competencia: i.competencia,
        vencimento: i.vencimento,
        status: i.status,
        responsavel: i.responsavel,
        observacao: i.observacao,
      },
    });
  }

  async function salvar() {
    if (!modal) return;
    setSalvando(true);
    setErro(null);
    const url = modal.id ? `/api/obrigacoes-acessorias/${modal.id}` : "/api/obrigacoes-acessorias";
    const method = modal.id ? "PUT" : "POST";
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(modal.form) });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) {
      setErro(j.error ?? "Não foi possível salvar.");
      return;
    }
    setModal(null);
    carregar();
  }

  async function excluir(id: number) {
    if (!confirm("Excluir esta obrigação?")) return;
    setExcluindo(id);
    const r = await fetch(`/api/obrigacoes-acessorias/${id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    setExcluindo(null);
    if (!r.ok) {
      setErro(j.error ?? "Não foi possível excluir.");
      return;
    }
    carregar();
  }

  const f = modal?.form;

  return (
    <div>
      {erro && <div className="banner error">{erro}</div>}

      <div className="summary">
        <div className="card">
          <div className="k">Registros</div>
          <div className="v">{resumo.total}</div>
        </div>
        <div className="card">
          <div className="k">Pendentes</div>
          <div className="v">{resumo.pendentes}</div>
        </div>
        <div className="card div">
          <div className="k">Atrasadas</div>
          <div className="v">{resumo.atrasadas}</div>
        </div>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Buscar empresa, obrigação, responsável..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        {["", ...STATUS_OBRIGACAO].map((s) => (
          <button key={s || "todos"} className={`chip ${statusFiltro === s ? "on" : ""}`} onClick={() => setStatusFiltro(s)}>
            {s || "Todos"}
          </button>
        ))}
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={abrirNovo}>
          + Nova obrigação
        </button>
      </div>

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th className="col-empresa">Empresa</th>
              <th>Obrigação</th>
              <th>Competência</th>
              <th>Vencimento</th>
              <th>Status</th>
              <th>Responsável</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {itens === null ? (
              <tr><td colSpan={7}>Carregando…</td></tr>
            ) : filtrados.length === 0 ? (
              <tr><td colSpan={7}>Nenhum registro encontrado.</td></tr>
            ) : (
              filtrados.map((i) => (
                <tr key={i.id}>
                  <td className="col-empresa">{i.empresa}</td>
                  <td>{i.obrigacao}</td>
                  <td>{i.competencia}</td>
                  <td>{i.vencimento ? new Date(i.vencimento + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                  <td><Badge status={i.status} /></td>
                  <td>{i.responsavel || "—"}</td>
                  <td>
                    <button className="btn icon" onClick={() => abrirEdicao(i)}>✏️</button>{" "}
                    <button className="btn icon" disabled={excluindo === i.id} onClick={() => excluir(i.id)}>🗑️</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && f && (
        <div className="modal-bg" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{modal.id ? "Editar obrigação" : "Nova obrigação"}</h2>
              <button className="btn icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-linha">
                <label>
                  Empresa
                  <input className="sel" style={{ width: "100%" }} value={f.empresa} onChange={(e) => setModal({ ...modal, form: { ...f, empresa: e.target.value } })} />
                </label>
                <label>
                  Obrigação
                  <input className="sel" style={{ width: "100%" }} list="obrigacoes-sugestao" value={f.obrigacao} onChange={(e) => setModal({ ...modal, form: { ...f, obrigacao: e.target.value } })} />
                  <datalist id="obrigacoes-sugestao">
                    {OBRIGACOES_SUGESTAO.map((op) => <option key={op} value={op} />)}
                  </datalist>
                </label>
              </div>
              <div className="form-linha">
                <label>
                  Competência (MM/AAAA)
                  <input className="sel" style={{ width: "100%" }} placeholder="09/2026" value={f.competencia} onChange={(e) => setModal({ ...modal, form: { ...f, competencia: e.target.value } })} />
                </label>
                <label>
                  Vencimento
                  <input type="date" className="sel" style={{ width: "100%" }} value={f.vencimento ?? ""} onChange={(e) => setModal({ ...modal, form: { ...f, vencimento: e.target.value || null } })} />
                </label>
              </div>
              <div className="form-linha">
                <label>
                  Status
                  <select className="sel" style={{ width: "100%" }} value={f.status} onChange={(e) => setModal({ ...modal, form: { ...f, status: e.target.value } })}>
                    {STATUS_OBRIGACAO.map((op) => <option key={op} value={op}>{op}</option>)}
                  </select>
                </label>
                <label>
                  Responsável
                  <input className="sel" style={{ width: "100%" }} value={f.responsavel ?? ""} onChange={(e) => setModal({ ...modal, form: { ...f, responsavel: e.target.value } })} />
                </label>
              </div>
              <div className="form-linha">
                <label style={{ flex: "1 1 100%" }}>
                  Observação
                  <textarea className="sel" style={{ width: "100%" }} rows={3} value={f.observacao ?? ""} onChange={(e) => setModal({ ...modal, form: { ...f, observacao: e.target.value } })} />
                </label>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setModal(null)}>Cancelar</button>{" "}
              <button className="btn primary" disabled={salvando || !f.empresa.trim() || !f.obrigacao.trim() || !f.competencia.trim()} onClick={salvar}>
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
