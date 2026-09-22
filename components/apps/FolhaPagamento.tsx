"use client";

import { useEffect, useMemo, useState } from "react";
import { STATUS_FOLHA, type FolhaPagamentoItem, type NovaFolhaPagamento } from "@/lib/folha-pagamento";
import type { SugestaoFuncionario } from "@/lib/trabalhista";

function Badge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cor = s === "paga" ? "var(--ok)" : s === "fechada" ? "var(--accent)" : "var(--muted)";
  return (
    <span className="badge" style={{ background: `color-mix(in srgb, ${cor} 15%, var(--surface))`, color: cor, fontWeight: 600 }}>
      {status}
    </span>
  );
}

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const VAZIO: NovaFolhaPagamento = {
  funcionario: "",
  empresa: "",
  competencia: "",
  salario_bruto: 0,
  descontos: 0,
  salario_liquido: 0,
  status: "Aberta",
  observacao: null,
};

export default function FolhaPagamento({
  sugestoes,
  sugestoesFonte,
  sugestoesErro,
}: {
  sugestoes: SugestaoFuncionario[];
  sugestoesFonte: "api" | "exemplo";
  sugestoesErro: string | null;
}) {
  const [itens, setItens] = useState<FolhaPagamentoItem[] | null>(null);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [modal, setModal] = useState<{ id: number | null; form: NovaFolhaPagamento } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    const r = await fetch("/api/folha-pagamento", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setItens(j.itens ?? []);
    else setErro(j.error ?? "Não foi possível carregar a folha.");
  }

  useEffect(() => {
    carregar();
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (itens ?? []).filter((i) => {
      if (statusFiltro && i.status !== statusFiltro) return false;
      if (!q) return true;
      return [i.funcionario, i.empresa, i.competencia, i.observacao].filter(Boolean).some((v) => v!.toLowerCase().includes(q));
    });
  }, [itens, busca, statusFiltro]);

  const resumo = useMemo(() => {
    const lista = itens ?? [];
    return {
      total: lista.length,
      abertas: lista.filter((i) => i.status === "Aberta").length,
      folhaLiquida: lista.reduce((s, i) => s + i.salario_liquido, 0),
    };
  }, [itens]);

  function abrirNovo() {
    setErro(null);
    setModal({ id: null, form: VAZIO });
  }

  function abrirEdicao(i: FolhaPagamentoItem) {
    setErro(null);
    setModal({
      id: i.id,
      form: {
        funcionario: i.funcionario,
        empresa: i.empresa,
        competencia: i.competencia,
        salario_bruto: i.salario_bruto,
        descontos: i.descontos,
        salario_liquido: i.salario_liquido,
        status: i.status,
        observacao: i.observacao,
      },
    });
  }

  function atualizarForm(patch: Partial<NovaFolhaPagamento>) {
    if (!modal) return;
    const novo = { ...modal.form, ...patch };
    novo.salario_liquido = (novo.salario_bruto || 0) - (novo.descontos || 0);
    setModal({ ...modal, form: novo });
  }

  const nomesFuncionarios = useMemo(
    () => Array.from(new Set(sugestoes.map((s) => s.nome))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [sugestoes]
  );
  const nomesEmpresas = useMemo(
    () => Array.from(new Set(sugestoes.map((s) => s.empresa).filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [sugestoes]
  );

  function selecionarFuncionario(nome: string) {
    const encontrado = sugestoes.find((s) => s.nome.toLowerCase() === nome.trim().toLowerCase());
    if (encontrado?.empresa && (!modal || !modal.form.empresa.trim())) {
      atualizarForm({ funcionario: nome, empresa: encontrado.empresa });
    } else {
      atualizarForm({ funcionario: nome });
    }
  }

  async function salvar() {
    if (!modal) return;
    setSalvando(true);
    setErro(null);
    const url = modal.id ? `/api/folha-pagamento/${modal.id}` : "/api/folha-pagamento";
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
    if (!confirm("Excluir este registro de folha?")) return;
    setExcluindo(id);
    const r = await fetch(`/api/folha-pagamento/${id}`, { method: "DELETE" });
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
          <div className="k">Em aberto</div>
          <div className="v">{resumo.abertas}</div>
        </div>
        <div className="card ok">
          <div className="k">Folha líquida (total)</div>
          <div className="v">{moeda(resumo.folhaLiquida)}</div>
        </div>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Buscar funcionário, empresa, competência..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        {["", ...STATUS_FOLHA].map((s) => (
          <button key={s || "todos"} className={`chip ${statusFiltro === s ? "on" : ""}`} onClick={() => setStatusFiltro(s)}>
            {s || "Todos"}
          </button>
        ))}
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={abrirNovo}>
          + Novo lançamento
        </button>
      </div>

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th className="col-empresa">Funcionário</th>
              <th>Empresa</th>
              <th>Competência</th>
              <th>Bruto</th>
              <th>Descontos</th>
              <th>Líquido</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {itens === null ? (
              <tr><td colSpan={8}>Carregando…</td></tr>
            ) : filtrados.length === 0 ? (
              <tr><td colSpan={8}>Nenhum registro encontrado.</td></tr>
            ) : (
              filtrados.map((i) => (
                <tr key={i.id}>
                  <td className="col-empresa">{i.funcionario}</td>
                  <td>{i.empresa}</td>
                  <td>{i.competencia}</td>
                  <td>{moeda(i.salario_bruto)}</td>
                  <td>{moeda(i.descontos)}</td>
                  <td>{moeda(i.salario_liquido)}</td>
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
              <h2>{modal.id ? "Editar lançamento" : "Novo lançamento"}</h2>
              <button className="btn icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-linha">
                <label>
                  Funcionário
                  <input
                    className="sel"
                    style={{ width: "100%" }}
                    list="funcionarios-sugestao"
                    value={f.funcionario}
                    onChange={(e) => selecionarFuncionario(e.target.value)}
                  />
                  <datalist id="funcionarios-sugestao">
                    {nomesFuncionarios.map((op) => <option key={op} value={op} />)}
                  </datalist>
                </label>
                <label>
                  Empresa
                  <input
                    className="sel"
                    style={{ width: "100%" }}
                    list="empresas-sugestao-folha"
                    value={f.empresa}
                    onChange={(e) => atualizarForm({ empresa: e.target.value })}
                  />
                  <datalist id="empresas-sugestao-folha">
                    {nomesEmpresas.map((op) => <option key={op} value={op} />)}
                  </datalist>
                </label>
              </div>
              {sugestoesFonte === "exemplo" && (
                <p className="footnote">Sugestões de funcionário/empresa são de exemplo. Configure a <code>QUESTOR_API_KEY</code> para sugestões reais (/rh/funcionarios-ativos).</p>
              )}
              {sugestoesErro && <p className="footnote">Sugestões indisponíveis: {sugestoesErro}</p>}
              <div className="form-linha">
                <label>
                  Competência (MM/AAAA)
                  <input className="sel" style={{ width: "100%" }} placeholder="09/2026" value={f.competencia} onChange={(e) => atualizarForm({ competencia: e.target.value })} />
                </label>
                <label>
                  Status
                  <select className="sel" style={{ width: "100%" }} value={f.status} onChange={(e) => atualizarForm({ status: e.target.value })}>
                    {STATUS_FOLHA.map((op) => <option key={op} value={op}>{op}</option>)}
                  </select>
                </label>
              </div>
              <div className="form-linha">
                <label>
                  Salário bruto
                  <input type="number" step="0.01" className="sel" style={{ width: "100%" }} value={f.salario_bruto} onChange={(e) => atualizarForm({ salario_bruto: Number(e.target.value) || 0 })} />
                </label>
                <label>
                  Descontos
                  <input type="number" step="0.01" className="sel" style={{ width: "100%" }} value={f.descontos} onChange={(e) => atualizarForm({ descontos: Number(e.target.value) || 0 })} />
                </label>
                <label>
                  Líquido (calculado)
                  <input className="sel" style={{ width: "100%" }} value={moeda(f.salario_liquido)} disabled />
                </label>
              </div>
              <div className="form-linha">
                <label style={{ flex: "1 1 100%" }}>
                  Observação
                  <textarea className="sel" style={{ width: "100%" }} rows={3} value={f.observacao ?? ""} onChange={(e) => atualizarForm({ observacao: e.target.value })} />
                </label>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setModal(null)}>Cancelar</button>{" "}
              <button className="btn primary" disabled={salvando || !f.funcionario.trim() || !f.empresa.trim() || !f.competencia.trim()} onClick={salvar}>
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
