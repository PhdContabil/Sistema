"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IMPOSTOS,
  STATUS_APURACAO,
  type ApuracaoImposto,
  type NovaApuracaoImposto,
} from "@/lib/apuracao-impostos";
import type { IcmsDifalResponse } from "@/lib/fiscal";

function Badge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cor = s === "pago" ? "var(--ok)" : s === "atrasado" ? "var(--div)" : "var(--muted)";
  return (
    <span
      className="badge"
      style={{ background: `color-mix(in srgb, ${cor} 15%, var(--surface))`, color: cor, fontWeight: 600 }}
    >
      {status}
    </span>
  );
}

function moedaDifal(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Painel de referência com dado real da API Questor (GET /fiscal/icms-difal). Somente leitura. */
function PainelIcmsDifal({ difal, fonte, erro }: { difal: IcmsDifalResponse; fonte: "api" | "exemplo"; erro: string | null }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [atualizando, setAtualizando] = useState(false);

  function atualizar() {
    setAtualizando(true);
    router.refresh();
    setTimeout(() => setAtualizando(false), 1200);
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return difal.dados;
    return difal.dados.filter((d) => (d.nome ?? "").toLowerCase().includes(q) || (d.cnpj ?? "").includes(q) || d.tipo_imposto.toLowerCase().includes(q));
  }, [difal, busca]);

  return (
    <div style={{ marginTop: 36 }}>
      <div className="page-sub" style={{ marginBottom: 8 }}>
        Referência ICMS DIFAL — dado real da API Questor, somente leitura (não altera a apuração manual acima)
      </div>
      {fonte === "exemplo" && (
        <div className="banner">Exibindo <strong>dados de exemplo</strong>. Configure a <code>QUESTOR_API_KEY</code> para dados reais.</div>
      )}
      {erro && <div className="banner error">{erro}</div>}

      <div className="summary" style={{ marginBottom: 12 }}>
        <div className="card">
          <div className="k">Lançamentos ({difal.periodo})</div>
          <div className="v">{difal.total}</div>
        </div>
        <div className="card">
          <div className="k">Valor total no período</div>
          <div className="v">{moedaDifal(difal.total_valor)}</div>
        </div>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Buscar empresa, CNPJ ou tipo..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="btn" style={{ marginLeft: "auto" }} onClick={atualizar} disabled={atualizando}>
          {atualizando ? "…" : "↻ Atualizar"}
        </button>
      </div>

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th className="col-empresa">Empresa</th>
              <th>CNPJ</th>
              <th>Competência</th>
              <th>Tipo</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr><td colSpan={5}>Nenhum lançamento encontrado.</td></tr>
            ) : (
              filtrados.map((d, idx) => (
                <tr key={`${d.codigoempresa}-${d.codigoestab}-${d.competencia}-${d.tipo_imposto}-${idx}`}>
                  <td className="col-empresa">{d.nome ?? `Empresa ${d.codigoempresa}`}</td>
                  <td>{d.cnpj ?? "—"}</td>
                  <td>{d.competencia}</td>
                  <td>{d.tipo_imposto}</td>
                  <td>{moedaDifal(d.valor)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const VAZIO: NovaApuracaoImposto = {
  empresa: "",
  imposto: "ICMS",
  competencia: "",
  valor_apurado: null,
  vencimento: null,
  status: "Pendente",
  observacao: null,
};

export default function ApuracaoImpostos({
  difal,
  difalFonte,
  difalErro,
}: {
  difal: IcmsDifalResponse;
  difalFonte: "api" | "exemplo";
  difalErro: string | null;
}) {
  const [itens, setItens] = useState<ApuracaoImposto[] | null>(null);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [modal, setModal] = useState<{ id: number | null; form: NovaApuracaoImposto } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    const r = await fetch("/api/apuracao-impostos", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setItens(j.itens ?? []);
    else setErro(j.error ?? "Não foi possível carregar a apuração.");
  }

  useEffect(() => {
    carregar();
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (itens ?? []).filter((i) => {
      if (statusFiltro && i.status !== statusFiltro) return false;
      if (!q) return true;
      return [i.empresa, i.imposto, i.competencia, i.observacao].filter(Boolean).some((v) => v!.toLowerCase().includes(q));
    });
  }, [itens, busca, statusFiltro]);

  const resumo = useMemo(() => {
    const lista = itens ?? [];
    return {
      total: lista.length,
      atrasados: lista.filter((i) => i.status === "Atrasado").length,
      valorTotal: lista.reduce((s, i) => s + (i.valor_apurado ?? 0), 0),
    };
  }, [itens]);

  function abrirNovo() {
    setErro(null);
    setModal({ id: null, form: VAZIO });
  }

  function abrirEdicao(i: ApuracaoImposto) {
    setErro(null);
    setModal({
      id: i.id,
      form: {
        empresa: i.empresa,
        imposto: i.imposto,
        competencia: i.competencia,
        valor_apurado: i.valor_apurado,
        vencimento: i.vencimento,
        status: i.status,
        observacao: i.observacao,
      },
    });
  }

  async function salvar() {
    if (!modal) return;
    setSalvando(true);
    setErro(null);
    const url = modal.id ? `/api/apuracao-impostos/${modal.id}` : "/api/apuracao-impostos";
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
    if (!confirm("Excluir este registro de apuração?")) return;
    setExcluindo(id);
    const r = await fetch(`/api/apuracao-impostos/${id}`, { method: "DELETE" });
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
        <div className="card div">
          <div className="k">Atrasados</div>
          <div className="v">{resumo.atrasados}</div>
        </div>
        <div className="card">
          <div className="k">Valor apurado (total)</div>
          <div className="v">{resumo.valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
        </div>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Buscar empresa, imposto, competência..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        {["", ...STATUS_APURACAO].map((s) => (
          <button key={s || "todos"} className={`chip ${statusFiltro === s ? "on" : ""}`} onClick={() => setStatusFiltro(s)}>
            {s || "Todos"}
          </button>
        ))}
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={abrirNovo}>
          + Nova apuração
        </button>
      </div>

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th className="col-empresa">Empresa</th>
              <th>Imposto</th>
              <th>Competência</th>
              <th>Valor apurado</th>
              <th>Vencimento</th>
              <th>Status</th>
              <th>Observação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {itens === null ? (
              <tr>
                <td colSpan={8}>Carregando…</td>
              </tr>
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={8}>Nenhum registro encontrado.</td>
              </tr>
            ) : (
              filtrados.map((i) => (
                <tr key={i.id}>
                  <td className="col-empresa">{i.empresa}</td>
                  <td>{i.imposto}</td>
                  <td>{i.competencia}</td>
                  <td>{i.valor_apurado != null ? i.valor_apurado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</td>
                  <td>{i.vencimento ? new Date(i.vencimento + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                  <td>
                    <Badge status={i.status} />
                  </td>
                  <td>{i.observacao || "—"}</td>
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
              <h2>{modal.id ? "Editar apuração" : "Nova apuração"}</h2>
              <button className="btn icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-linha">
                <label>
                  Empresa
                  <input className="sel" style={{ width: "100%" }} value={f.empresa} onChange={(e) => setModal({ ...modal, form: { ...f, empresa: e.target.value } })} />
                </label>
                <label>
                  Imposto
                  <select className="sel" style={{ width: "100%" }} value={f.imposto} onChange={(e) => setModal({ ...modal, form: { ...f, imposto: e.target.value } })}>
                    {IMPOSTOS.map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-linha">
                <label>
                  Competência (MM/AAAA)
                  <input className="sel" style={{ width: "100%" }} placeholder="09/2026" value={f.competencia} onChange={(e) => setModal({ ...modal, form: { ...f, competencia: e.target.value } })} />
                </label>
                <label>
                  Valor apurado
                  <input type="number" step="0.01" className="sel" style={{ width: "100%" }} value={f.valor_apurado ?? ""} onChange={(e) => setModal({ ...modal, form: { ...f, valor_apurado: e.target.value ? Number(e.target.value) : null } })} />
                </label>
              </div>
              <div className="form-linha">
                <label>
                  Vencimento
                  <input type="date" className="sel" style={{ width: "100%" }} value={f.vencimento ?? ""} onChange={(e) => setModal({ ...modal, form: { ...f, vencimento: e.target.value || null } })} />
                </label>
                <label>
                  Status
                  <select className="sel" style={{ width: "100%" }} value={f.status} onChange={(e) => setModal({ ...modal, form: { ...f, status: e.target.value } })}>
                    {STATUS_APURACAO.map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
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

      <PainelIcmsDifal difal={difal} fonte={difalFonte} erro={difalErro} />
    </div>
  );
}
