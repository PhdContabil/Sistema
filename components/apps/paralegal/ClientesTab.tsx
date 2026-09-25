"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface Cliente {
  id: string;
  nome: string;
  empresa: string;
  cnpj: string;
  indicacao: string;
  categoria: string;
  vendedor: string;
}

const VAZIO: Omit<Cliente, "id"> = { nome: "", empresa: "", cnpj: "", indicacao: "", categoria: "", vendedor: "" };

interface ClientesTabProps {
  // Dados vindos do botão "Recadastrar" da aba Empresas — ao chegar, abre o
  // modal de novo cliente já preenchido. onPrefillConsumido avisa o pai para
  // limpar o prefill, evitando reabrir o modal se o usuário trocar de aba e voltar.
  prefill?: { nome: string; empresa: string; cnpj: string } | null;
  onPrefillConsumido?: () => void;
}

export default function ClientesTab({ prefill, onPrefillConsumido }: ClientesTabProps = {}) {
  const [itens, setItens] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [modal, setModal] = useState<null | { editando: Cliente | null; dados: Omit<Cliente, "id"> }>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/paralegal/clientes", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Falha ao carregar clientes."); return; }
      setItens(j.itens ?? []);
    } catch {
      setErro("Falha de rede ao carregar clientes.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // O cadastro tem milhares de clientes — debounce evita refiltrar/re-renderizar
  // a cada tecla, e o limite de 300 linhas visíveis evita montar milhares de
  // <tr> de uma vez (era a causa real da lentidão).
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 250);
    return () => clearTimeout(t);
  }, [busca]);

  const filtrados = useMemo(() => {
    const q = buscaDebounced.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((c) => [c.nome, c.empresa, c.cnpj, c.vendedor].some((v) => v.toLowerCase().includes(q)));
  }, [itens, buscaDebounced]);

  const visiveis = useMemo(() => filtrados.slice(0, 300), [filtrados]);

  useEffect(() => {
    if (!prefill) return;
    setModal({ editando: null, dados: { ...VAZIO, nome: prefill.nome, empresa: prefill.empresa, cnpj: prefill.cnpj } });
    onPrefillConsumido?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  function abrirNovo() {
    setModal({ editando: null, dados: { ...VAZIO } });
  }

  function abrirEdicao(c: Cliente) {
    setModal({ editando: c, dados: { nome: c.nome, empresa: c.empresa, cnpj: c.cnpj, indicacao: c.indicacao, categoria: c.categoria, vendedor: c.vendedor } });
  }

  async function salvar() {
    if (!modal) return;
    if (!modal.dados.nome.trim()) { setErro("Nome é obrigatório."); return; }
    setSalvando(true);
    setErro(null);
    try {
      const editando = modal.editando;
      const r = await fetch(editando ? `/api/paralegal/clientes/${editando.id}` : "/api/paralegal/clientes", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modal.dados),
      });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Falha ao salvar."); return; }
      setModal(null);
      await carregar();
    } catch {
      setErro("Falha de rede ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(c: Cliente) {
    if (!confirm(`Excluir o cliente "${c.nome}"?`)) return;
    try {
      const r = await fetch(`/api/paralegal/clientes/${c.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Falha ao excluir."); return; }
      await carregar();
    } catch {
      setErro("Falha de rede ao excluir.");
    }
  }

  return (
    <div>
      <div className="pl-toolbar">
        <input
          type="text"
          placeholder="Buscar por nome, empresa, CNPJ ou vendedor…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button className="pl-btn" onClick={carregar} disabled={carregando}>{carregando ? "Carregando…" : "↻ Atualizar"}</button>
        <button className="pl-btn primary" onClick={abrirNovo}>+ Novo cliente</button>
      </div>

      {erro && <div className="pl-banner error">{erro}</div>}

      <div className="pl-table-wrap">
        <table className="pl-grid">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Empresa</th>
              <th>CNPJ</th>
              <th>Categoria</th>
              <th>Vendedor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((c) => (
              <tr key={c.id}>
                <td>{c.nome}</td>
                <td>{c.empresa}</td>
                <td>{c.cnpj}</td>
                <td>{c.categoria}</td>
                <td>{c.vendedor}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="pl-btn" onClick={() => abrirEdicao(c)}>Editar</button>{" "}
                  <button className="pl-btn danger" onClick={() => excluir(c)}>Excluir</button>
                </td>
              </tr>
            ))}
            {!carregando && visiveis.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--pl-ink-soft)" }}>Nenhum cliente encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {filtrados.length > 300 && (
        <div className="pl-banner" style={{ marginTop: 10 }}>Mostrando os primeiros 300 de {filtrados.length} — refine a busca.</div>
      )}

      {modal && (
        <div className="pl-modal-bg" onClick={() => !salvando && setModal(null)}>
          <div className="pl-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{modal.editando ? "Editar cliente" : "Novo cliente"}</h3>

            <label>
              <span>Nome</span>
              <input value={modal.dados.nome} onChange={(e) => setModal({ ...modal, dados: { ...modal.dados, nome: e.target.value } })} />
            </label>
            <label>
              <span>Empresa</span>
              <input value={modal.dados.empresa} onChange={(e) => setModal({ ...modal, dados: { ...modal.dados, empresa: e.target.value } })} />
            </label>
            <label>
              <span>CNPJ</span>
              <input value={modal.dados.cnpj} onChange={(e) => setModal({ ...modal, dados: { ...modal.dados, cnpj: e.target.value } })} />
            </label>
            <label>
              <span>Indicação</span>
              <input value={modal.dados.indicacao} onChange={(e) => setModal({ ...modal, dados: { ...modal.dados, indicacao: e.target.value } })} />
            </label>
            <label>
              <span>Categoria</span>
              <input value={modal.dados.categoria} onChange={(e) => setModal({ ...modal, dados: { ...modal.dados, categoria: e.target.value } })} />
            </label>
            <label>
              <span>Vendedor</span>
              <input value={modal.dados.vendedor} onChange={(e) => setModal({ ...modal, dados: { ...modal.dados, vendedor: e.target.value } })} />
            </label>

            <div className="pl-toolbar" style={{ marginTop: 4 }}>
              <button className="pl-btn" onClick={() => setModal(null)} disabled={salvando}>Cancelar</button>
              <button className="pl-btn primary" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
