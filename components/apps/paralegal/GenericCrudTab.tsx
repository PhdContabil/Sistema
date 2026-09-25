"use client";

import { useCallback, useEffect, useState } from "react";

type Tipo = "text" | "number" | "date" | "textarea";

export interface CampoConfig<T extends { id: string }> {
  chave: keyof Omit<T, "id">;
  rotulo: string;
  tipo?: Tipo;
  obrigatorio?: boolean;
}

export interface ColunaConfig<T> {
  chave: keyof Omit<T, "id">;
  rotulo: string;
  render?: (item: T) => React.ReactNode;
}

interface Props<T extends { id: string }> {
  api: string; // ex.: "/api/paralegal/contratos"
  colunas: ColunaConfig<T>[];
  campos: CampoConfig<T>[];
  vazio: Omit<T, "id">;
  buscaCampos: (keyof T)[];
  tituloItem: (item: T) => string;
  nomeNovo: string; // ex.: "Novo contrato"
}

export default function GenericCrudTab<T extends { id: string }>({
  api, colunas, campos, vazio, buscaCampos, tituloItem, nomeNovo,
}: Props<T>) {
  const [itens, setItens] = useState<T[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState<null | { editando: T | null; dados: Omit<T, "id"> }>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(api, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Falha ao carregar."); return; }
      setItens(j.itens ?? []);
    } catch {
      setErro("Falha de rede ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, [api]);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = itens.filter((item) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return buscaCampos.some((c) => String(item[c] ?? "").toLowerCase().includes(q));
  });

  function abrirNovo() {
    setModal({ editando: null, dados: { ...vazio } });
  }

  function abrirEdicao(item: T) {
    const { id: _id, ...dados } = item as T & { id: string };
    setModal({ editando: item, dados: dados as Omit<T, "id"> });
  }

  async function salvar() {
    if (!modal) return;
    for (const c of campos) {
      if (c.obrigatorio && !String(modal.dados[c.chave] ?? "").trim()) {
        setErro(`Campo obrigatório: ${c.rotulo}.`);
        return;
      }
    }
    setSalvando(true);
    setErro(null);
    try {
      const editando = modal.editando;
      const r = await fetch(editando ? `${api}/${editando.id}` : api, {
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

  async function excluir(item: T) {
    if (!confirm(`Excluir "${tituloItem(item)}"?`)) return;
    try {
      const r = await fetch(`${api}/${item.id}`, { method: "DELETE" });
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
          placeholder="Buscar…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button className="pl-btn" onClick={carregar} disabled={carregando}>{carregando ? "Carregando…" : "↻ Atualizar"}</button>
        <button className="pl-btn primary" onClick={abrirNovo}>+ {nomeNovo}</button>
      </div>

      {erro && <div className="pl-banner error">{erro}</div>}

      <div className="pl-table-wrap">
        <table className="pl-grid">
          <thead>
            <tr>
              {colunas.map((c) => <th key={String(c.chave)}>{c.rotulo}</th>)}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((item) => (
              <tr key={item.id}>
                {colunas.map((c) => (
                  <td key={String(c.chave)}>{c.render ? c.render(item) : String(item[c.chave] ?? "")}</td>
                ))}
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="pl-btn" onClick={() => abrirEdicao(item)}>Editar</button>{" "}
                  <button className="pl-btn danger" onClick={() => excluir(item)}>Excluir</button>
                </td>
              </tr>
            ))}
            {!carregando && filtrados.length === 0 && (
              <tr><td colSpan={colunas.length + 1} style={{ textAlign: "center", color: "var(--pl-ink-soft)" }}>Nenhum item encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="pl-modal-bg" onClick={() => !salvando && setModal(null)}>
          <div className="pl-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{modal.editando ? "Editar" : nomeNovo}</h3>

            {campos.map((c) => (
              <label key={String(c.chave)}>
                <span>{c.rotulo}{c.obrigatorio ? " *" : ""}</span>
                {c.tipo === "textarea" ? (
                  <textarea
                    rows={4}
                    value={String(modal.dados[c.chave] ?? "")}
                    onChange={(e) => setModal({ ...modal, dados: { ...modal.dados, [c.chave]: e.target.value } })}
                  />
                ) : (
                  <input
                    type={c.tipo === "date" ? "date" : c.tipo === "number" ? "number" : "text"}
                    value={String(modal.dados[c.chave] ?? "")}
                    onChange={(e) => {
                      const v: unknown = c.tipo === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value;
                      setModal({ ...modal, dados: { ...modal.dados, [c.chave]: v } });
                    }}
                  />
                )}
              </label>
            ))}

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
