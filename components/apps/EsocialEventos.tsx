"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TIPOS_EVENTO_ESOCIAL,
  STATUS_ESOCIAL,
  type EsocialEvento,
  type NovoEsocialEvento,
} from "@/lib/esocial";

function Badge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cor = s === "processado" ? "var(--ok)" : s === "erro" ? "var(--div)" : s === "enviado" ? "var(--accent)" : "var(--muted)";
  return (
    <span className="badge" style={{ background: `color-mix(in srgb, ${cor} 15%, var(--surface))`, color: cor, fontWeight: 600 }}>
      {status}
    </span>
  );
}

const VAZIO: NovoEsocialEvento = {
  empresa: "",
  tipo_evento: "Admissão",
  competencia: "",
  data_envio: null,
  protocolo: null,
  status: "Pendente",
  observacao: null,
};

export default function EsocialEventos() {
  const [itens, setItens] = useState<EsocialEvento[] | null>(null);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [modal, setModal] = useState<{ id: number | null; form: NovoEsocialEvento } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    const r = await fetch("/api/esocial", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setItens(j.itens ?? []);
    else setErro(j.error ?? "Não foi possível carregar os eventos.");
  }

  useEffect(() => {
    carregar();
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (itens ?? []).filter((i) => {
      if (statusFiltro && i.status !== statusFiltro) return false;
      if (!q) return true;
      return [i.empresa, i.tipo_evento, i.competencia, i.protocolo, i.observacao].filter(Boolean).some((v) => v!.toLowerCase().includes(q));
    });
  }, [itens, busca, statusFiltro]);

  const resumo = useMemo(() => {
    const lista = itens ?? [];
    return {
      total: lista.length,
      pendentes: lista.filter((i) => i.status === "Pendente").length,
      erros: lista.filter((i) => i.status === "Erro").length,
    };
  }, [itens]);

  function abrirNovo() {
    setErro(null);
    setModal({ id: null, form: VAZIO });
  }

  function abrirEdicao(i: EsocialEvento) {
    setErro(null);
    setModal({
      id: i.id,
      form: {
        empresa: i.empresa,
        tipo_evento: i.tipo_evento,
        competencia: i.competencia,
        data_envio: i.data_envio,
        protocolo: i.protocolo,
        status: i.status,
        observacao: i.observacao,
      },
    });
  }

  async function salvar() {
    if (!modal) return;
    setSalvando(true);
    setErro(null);
    const url = modal.id ? `/api/esocial/${modal.id}` : "/api/esocial";
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
    if (!confirm("Excluir este evento?")) return;
    setExcluindo(id);
    const r = await fetch(`/api/esocial/${id}`, { method: "DELETE" });
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
          <div className="k">Eventos</div>
          <div className="v">{resumo.total}</div>
        </div>
        <div className="card">
          <div className="k">Pendentes</div>
          <div className="v">{resumo.pendentes}</div>
        </div>
        <div className="card div">
          <div className="k">Com erro</div>
          <div className="v">{resumo.erros}</div>
        </div>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Buscar empresa, tipo, protocolo..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        {["", ...STATUS_ESOCIAL].map((s) => (
          <button key={s || "todos"} className={`chip ${statusFiltro === s ? "on" : ""}`} onClick={() => setStatusFiltro(s)}>
            {s || "Todos"}
          </button>
        ))}
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={abrirNovo}>
          + Novo evento
        </button>
      </div>

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th className="col-empresa">Empresa</th>
              <th>Tipo de evento</th>
              <th>Competência</th>
              <th>Data de envio</th>
              <th>Protocolo</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {itens === null ? (
              <tr><td colSpan={7}>Carregando…</td></tr>
            ) : filtrados.length === 0 ? (
              <tr><td colSpan={7}>Nenhum evento encontrado.</td></tr>
            ) : (
              filtrados.map((i) => (
                <tr key={i.id}>
                  <td className="col-empresa">{i.empresa}</td>
                  <td>{i.tipo_evento}</td>
                  <td>{i.competencia}</td>
                  <td>{i.data_envio ? new Date(i.data_envio + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                  <td>{i.protocolo || "—"}</td>
                  <td><Badge status={i.status} /></td>
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
              <h2>{modal.id ? "Editar evento" : "Novo evento"}</h2>
              <button className="btn icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-linha">
                <label>
                  Empresa
                  <input className="sel" style={{ width: "100%" }} value={f.empresa} onChange={(e) => setModal({ ...modal, form: { ...f, empresa: e.target.value } })} />
                </label>
                <label>
                  Tipo de evento
                  <select className="sel" style={{ width: "100%" }} value={f.tipo_evento} onChange={(e) => setModal({ ...modal, form: { ...f, tipo_evento: e.target.value } })}>
                    {TIPOS_EVENTO_ESOCIAL.map((op) => <option key={op} value={op}>{op}</option>)}
                  </select>
                </label>
              </div>
              <div className="form-linha">
                <label>
                  Competência (MM/AAAA)
                  <input className="sel" style={{ width: "100%" }} placeholder="09/2026" value={f.competencia} onChange={(e) => setModal({ ...modal, form: { ...f, competencia: e.target.value } })} />
                </label>
                <label>
                  Data de envio
                  <input type="date" className="sel" style={{ width: "100%" }} value={f.data_envio ?? ""} onChange={(e) => setModal({ ...modal, form: { ...f, data_envio: e.target.value || null } })} />
                </label>
              </div>
              <div className="form-linha">
                <label>
                  Protocolo
                  <input className="sel" style={{ width: "100%" }} value={f.protocolo ?? ""} onChange={(e) => setModal({ ...modal, form: { ...f, protocolo: e.target.value } })} />
                </label>
                <label>
                  Status
                  <select className="sel" style={{ width: "100%" }} value={f.status} onChange={(e) => setModal({ ...modal, form: { ...f, status: e.target.value } })}>
                    {STATUS_ESOCIAL.map((op) => <option key={op} value={op}>{op}</option>)}
                  </select>
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
              <button className="btn primary" disabled={salvando || !f.empresa.trim() || !f.competencia.trim()} onClick={salvar}>
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
