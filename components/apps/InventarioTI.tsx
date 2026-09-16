"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CATEGORIA_LABEL,
  type CategoriaInventario,
  type ItemInventario,
  type NovoItemInventario,
} from "@/lib/inventario";
import { SERVIDOR_SPECS } from "@/lib/inventario-servidor";
import { INPUT, BTN, BTN_PRIMARY, CARD } from "./TicketsBoard";

const ABAS: { id: CategoriaInventario | "servidor"; nome: string }[] = [
  { id: "notebook_uso", nome: "Em uso" },
  { id: "notebook_estoque", nome: "Em estoque (CPD)" },
  { id: "periferico", nome: "Periféricos" },
  { id: "servidor", nome: "Servidor" },
];

const SETORES_SUGESTAO = [
  "T.I", "MEI", "Financeiro", "Paralegal", "Contábil", "Fiscal",
  "Trabalhista", "Diretoria", "Terceiros",
];
const MARCAS_SUGESTAO = ["HP", "DELL", "LENOVO", "ASUS", "Desktop"];
const CATEGORIAS_PERIFERICO_SUGESTAO = ["Teclado", "Mouse", "Fone", "Impressora Multifuncional", "Monitor", "Webcam"];

const VAZIO = (categoria: CategoriaInventario): NovoItemInventario => ({
  categoria,
  item: "",
  responsavel: null,
  setor: null,
  marca: null,
  especificacao: null,
  ano: null,
  categoria_periferico: null,
  status: categoria === "notebook_uso" ? "Ativo" : categoria === "periferico" ? "Novo" : "Funcionando",
  quantidade: 1,
  observacao: null,
});

function Badge({ children, tom = "neutro" }: { children: React.ReactNode; tom?: "neutro" | "ok" | "alerta" | "erro" }) {
  const cores: Record<string, string> = {
    neutro: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
    ok: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
    alerta: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
    erro: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cores[tom]}`}>{children}</span>;
}

function tomStatus(status: string): "ok" | "alerta" | "erro" | "neutro" {
  const s = status.toLowerCase();
  // "inativo" precisa ser checado antes de "ativo" — senão cai no include()
  // de "ativo" (que também bate em "inativo") e nunca chega a ficar vermelho.
  if (s.includes("inativo") || s.includes("não liga") || s.includes("nao liga")) return "erro";
  if (s.includes("ativo") || s === "funcionando" || s === "novo") return "ok";
  if (s === "usado") return "neutro";
  return "alerta";
}

export default function InventarioTI() {
  const [aba, setAba] = useState<CategoriaInventario | "servidor">("notebook_uso");
  const [itens, setItens] = useState<ItemInventario[] | null>(null);
  const [busca, setBusca] = useState("");
  const [setorFiltro, setSetorFiltro] = useState("");
  const [modal, setModal] = useState<{ id: number | null; form: NovoItemInventario } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    const r = await fetch("/api/inventario", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setItens(j.itens ?? []);
    else setErro(j.error ?? "Não foi possível carregar o inventário.");
  }

  useEffect(() => { carregar(); }, []);

  const daAba = useMemo(
    () => (aba === "servidor" ? [] : (itens ?? []).filter((i) => i.categoria === aba)),
    [itens, aba]
  );

  const setoresPresentes = useMemo(() => {
    const s = new Set<string>();
    for (const i of itens ?? []) if (i.categoria === "notebook_uso" && i.setor) s.add(i.setor);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [itens]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return daAba.filter((i) => {
      if (aba === "notebook_uso" && setorFiltro && i.setor !== setorFiltro) return false;
      if (!q) return true;
      return [i.item, i.responsavel, i.setor, i.marca, i.especificacao, i.observacao]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [daAba, busca, setorFiltro, aba]);

  const resumo = useMemo(() => {
    const uso = (itens ?? []).filter((i) => i.categoria === "notebook_uso");
    const estoque = (itens ?? []).filter((i) => i.categoria === "notebook_estoque");
    const perifericos = (itens ?? []).filter((i) => i.categoria === "periferico");
    return {
      totalUso: uso.length,
      usoAtivos: uso.filter((i) => i.status.toLowerCase().includes("ativo") && !i.status.toLowerCase().includes("inativo")).length,
      totalEstoque: estoque.length,
      totalPerifericos: perifericos.reduce((s, i) => s + i.quantidade, 0),
    };
  }, [itens]);

  function abrirNovo() {
    if (aba === "servidor") return;
    setErro(null);
    setModal({ id: null, form: VAZIO(aba) });
  }

  function abrirEdicao(i: ItemInventario) {
    setErro(null);
    setModal({
      id: i.id,
      form: {
        categoria: i.categoria, item: i.item, responsavel: i.responsavel, setor: i.setor,
        marca: i.marca, especificacao: i.especificacao, ano: i.ano,
        categoria_periferico: i.categoria_periferico, status: i.status,
        quantidade: i.quantidade, observacao: i.observacao,
      },
    });
  }

  async function salvar() {
    if (!modal) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(modal.id ? `/api/inventario/${modal.id}` : "/api/inventario", {
        method: modal.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modal.form),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível salvar."); return; }
      setModal(null);
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: number, nome: string) {
    if (!confirm(`Remover "${nome}" do inventário?`)) return;
    setExcluindo(id);
    setErro(null);
    try {
      const r = await fetch(`/api/inventario/${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível remover."); return; }
      await carregar();
    } finally {
      setExcluindo(null);
    }
  }

  const f = modal?.form;

  return (
    <>
      {erro && <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 text-sm rounded-lg px-4 py-3">{erro}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className={`${CARD} px-4 py-3`}>
          <div className="text-xs text-slate-500 dark:text-slate-400">Em uso</div>
          <div className="text-xl font-semibold text-slate-800 dark:text-slate-100">{resumo.totalUso}</div>
          <div className="text-[11px] text-slate-400">{resumo.usoAtivos} ativos</div>
        </div>
        <div className={`${CARD} px-4 py-3`}>
          <div className="text-xs text-slate-500 dark:text-slate-400">Em estoque (CPD)</div>
          <div className="text-xl font-semibold text-slate-800 dark:text-slate-100">{resumo.totalEstoque}</div>
        </div>
        <div className={`${CARD} px-4 py-3`}>
          <div className="text-xs text-slate-500 dark:text-slate-400">Periféricos</div>
          <div className="text-xl font-semibold text-slate-800 dark:text-slate-100">{resumo.totalPerifericos}</div>
          <div className="text-[11px] text-slate-400">unidades no total</div>
        </div>
        <div className={`${CARD} px-4 py-3`}>
          <div className="text-xs text-slate-500 dark:text-slate-400">Total geral</div>
          <div className="text-xl font-semibold text-slate-800 dark:text-slate-100">{resumo.totalUso + resumo.totalEstoque}</div>
          <div className="text-[11px] text-slate-400">notebooks e desktops</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => { setAba(a.id); setSetorFiltro(""); setBusca(""); }}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition ${
              aba === a.id ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {a.nome}
          </button>
        ))}
      </div>

      {aba === "servidor" ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {SERVIDOR_SPECS.map((g) => (
            <div key={g.titulo} className={`${CARD} overflow-hidden`}>
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {g.titulo}
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {g.linhas.map((l) => (
                  <div key={l.label} className="flex justify-between gap-3 px-4 py-2 text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{l.label}</span>
                    <span className="text-right text-slate-800 dark:text-slate-100">{l.valor}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <svg viewBox="0 0 20 20" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="9" cy="9" r="6" /><path d="M17 17l-4-4" strokeLinecap="round" />
              </svg>
              <input className={`${INPUT} w-full pl-9`} placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            {aba === "notebook_uso" && (
              <select className={INPUT} value={setorFiltro} onChange={(e) => setSetorFiltro(e.target.value)}>
                <option value="">Todos os setores</option>
                {setoresPresentes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <button className={`${BTN_PRIMARY} inline-flex items-center gap-1.5`} onClick={abrirNovo}>
              <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor"><path d="M10 4a1 1 0 011 1v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V5a1 1 0 011-1z" /></svg>
              Adicionar item
            </button>
            <span className="text-xs text-slate-500 ml-auto">{filtrados.length} de {daAba.length}</span>
          </div>

          <div className={`${CARD} overflow-hidden overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900 text-left text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  {aba === "notebook_uso" && <>
                    <th className="px-4 py-2.5">Responsável</th>
                    <th className="px-4 py-2.5">Setor</th>
                    <th className="px-4 py-2.5">Equipamento</th>
                  </>}
                  {aba === "notebook_estoque" && <>
                    <th className="px-4 py-2.5">Modelo</th>
                    <th className="px-4 py-2.5">Marca</th>
                    <th className="px-4 py-2.5">Ano</th>
                    <th className="px-4 py-2.5">Especificação</th>
                    <th className="px-4 py-2.5 text-center">Qtd.</th>
                  </>}
                  {aba === "periferico" && <>
                    <th className="px-4 py-2.5">Item</th>
                    <th className="px-4 py-2.5">Categoria</th>
                    <th className="px-4 py-2.5 text-center">Qtd.</th>
                  </>}
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Observação</th>
                  <th className="px-4 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((i) => (
                  <tr key={i.id} className="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    {aba === "notebook_uso" && <>
                      <td className="px-4 py-2.5">{i.responsavel}</td>
                      <td className="px-4 py-2.5"><Badge>{i.setor}</Badge></td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{i.item} {i.marca}</td>
                    </>}
                    {aba === "notebook_estoque" && <>
                      <td className="px-4 py-2.5">{i.item}</td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{i.marca}</td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{i.ano ?? "—"}</td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{i.especificacao ?? "—"}</td>
                      <td className="px-4 py-2.5 text-center">{i.quantidade}</td>
                    </>}
                    {aba === "periferico" && <>
                      <td className="px-4 py-2.5">{i.item}</td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{i.categoria_periferico ?? "—"}</td>
                      <td className="px-4 py-2.5 text-center">{i.quantidade}</td>
                    </>}
                    <td className="px-4 py-2.5"><Badge tom={tomStatus(i.status)}>{i.status}</Badge></td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 max-w-[220px] truncate" title={i.observacao ?? undefined}>{i.observacao ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => abrirEdicao(i)} title="Editar" className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 mr-1">
                        <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-8.5 8.5a2 2 0 01-.878.507l-3 .857a.5.5 0 01-.62-.62l.857-3a2 2 0 01.507-.878l8.5-8.5z" /></svg>
                      </button>
                      <button
                        onClick={() => excluir(i.id, i.item)}
                        disabled={excluindo === i.id}
                        title="Remover"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-30"
                      >
                        <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor"><path fillRule="evenodd" d="M8 2a1 1 0 00-1 1v1H4a1 1 0 000 2h12a1 1 0 100-2h-3V3a1 1 0 00-1-1H8zM5 7a1 1 0 011 1v8a2 2 0 002 2h4a2 2 0 002-2V8a1 1 0 112 0v8a4 4 0 01-4 4H8a4 4 0 01-4-4V8a1 1 0 011-1z" clipRule="evenodd" /></svg>
                      </button>
                    </td>
                  </tr>
                ))}
                {itens !== null && filtrados.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500 text-sm">Nenhum item encontrado.</td></tr>
                )}
                {itens === null && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500 text-sm">Carregando…</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modal && f && (
        <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl text-slate-900 dark:text-slate-200 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-semibold">{modal.id ? "Editar item" : "Novo item"}</h2>
              <button onClick={() => setModal(null)} aria-label="Fechar" className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {erro && <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 text-sm rounded-lg px-4 py-3">{erro}</div>}

              <label className="block">
                <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Categoria</span>
                <select
                  className={`${INPUT} w-full`}
                  value={f.categoria}
                  onChange={(e) => setModal({ ...modal, form: VAZIO(e.target.value as CategoriaInventario) })}
                >
                  {(["notebook_uso", "notebook_estoque", "periferico"] as CategoriaInventario[]).map((c) => (
                    <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">
                  {f.categoria === "periferico" ? "Item" : "Modelo / equipamento"}
                </span>
                <input
                  className={`${INPUT} w-full`}
                  value={f.item}
                  placeholder={f.categoria === "notebook_uso" ? "Notebook, Desktop…" : ""}
                  onChange={(e) => setModal({ ...modal, form: { ...f, item: e.target.value } })}
                />
              </label>

              {f.categoria === "notebook_uso" && (
                <>
                  <label className="block">
                    <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Responsável</span>
                    <input className={`${INPUT} w-full`} value={f.responsavel ?? ""} onChange={(e) => setModal({ ...modal, form: { ...f, responsavel: e.target.value } })} />
                  </label>
                  <label className="block">
                    <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Setor</span>
                    <input className={`${INPUT} w-full`} list="setores-sugestao" value={f.setor ?? ""} onChange={(e) => setModal({ ...modal, form: { ...f, setor: e.target.value } })} />
                    <datalist id="setores-sugestao">{SETORES_SUGESTAO.map((s) => <option key={s} value={s} />)}</datalist>
                  </label>
                </>
              )}

              {(f.categoria === "notebook_uso" || f.categoria === "notebook_estoque") && (
                <label className="block">
                  <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Marca</span>
                  <input className={`${INPUT} w-full`} list="marcas-sugestao" value={f.marca ?? ""} onChange={(e) => setModal({ ...modal, form: { ...f, marca: e.target.value } })} />
                  <datalist id="marcas-sugestao">{MARCAS_SUGESTAO.map((m) => <option key={m} value={m} />)}</datalist>
                </label>
              )}

              {f.categoria === "notebook_estoque" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Ano</span>
                      <input type="number" className={`${INPUT} w-full`} value={f.ano ?? ""} onChange={(e) => setModal({ ...modal, form: { ...f, ano: e.target.value ? Number(e.target.value) : null } })} />
                    </label>
                    <label className="block">
                      <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Quantidade</span>
                      <input type="number" min={1} className={`${INPUT} w-full`} value={f.quantidade} onChange={(e) => setModal({ ...modal, form: { ...f, quantidade: Number(e.target.value) || 1 } })} />
                    </label>
                  </div>
                  <label className="block">
                    <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Especificação</span>
                    <input className={`${INPUT} w-full`} placeholder="Processador, RAM, armazenamento…" value={f.especificacao ?? ""} onChange={(e) => setModal({ ...modal, form: { ...f, especificacao: e.target.value } })} />
                  </label>
                </>
              )}

              {f.categoria === "periferico" && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Categoria do periférico</span>
                    <input className={`${INPUT} w-full`} list="categorias-periferico-sugestao" value={f.categoria_periferico ?? ""} onChange={(e) => setModal({ ...modal, form: { ...f, categoria_periferico: e.target.value } })} />
                    <datalist id="categorias-periferico-sugestao">{CATEGORIAS_PERIFERICO_SUGESTAO.map((c) => <option key={c} value={c} />)}</datalist>
                  </label>
                  <label className="block">
                    <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Quantidade</span>
                    <input type="number" min={1} className={`${INPUT} w-full`} value={f.quantidade} onChange={(e) => setModal({ ...modal, form: { ...f, quantidade: Number(e.target.value) || 1 } })} />
                  </label>
                </div>
              )}

              <label className="block">
                <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Status</span>
                <input className={`${INPUT} w-full`} value={f.status} onChange={(e) => setModal({ ...modal, form: { ...f, status: e.target.value } })} />
              </label>

              <label className="block">
                <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Observação</span>
                <textarea className={`${INPUT} w-full`} rows={2} value={f.observacao ?? ""} onChange={(e) => setModal({ ...modal, form: { ...f, observacao: e.target.value } })} />
              </label>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button className={BTN} onClick={() => setModal(null)}>Cancelar</button>
              <button className={BTN_PRIMARY} onClick={salvar} disabled={salvando || !f.item.trim() || !f.status.trim()}>
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
