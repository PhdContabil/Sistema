"use client";

import { useEffect, useMemo, useState } from "react";
import { SETORES, SETOR_NOME, type PessoaTickets } from "@/lib/tickets";
import { INPUT, BTN, BTN_PRIMARY, CARD } from "./TicketsBoard";

interface FormState {
  email: string;
  name: string;
  sector: string;
  is_sub_admin: boolean;
}

const VAZIO: FormState = { email: "", name: "", sector: "contabil", is_sub_admin: false };

export default function TicketsUsuarios({ meuEmail }: { meuEmail: string | null }) {
  const [usuarios, setUsuarios] = useState<PessoaTickets[] | null>(null);
  const [busca, setBusca] = useState("");
  const [setor, setSetor] = useState("");
  const [modal, setModal] = useState<{ editando: boolean; form: FormState } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    const r = await fetch("/api/tickets/usuarios", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setUsuarios(j.usuarios ?? []);
    else setErro(j.error ?? "Não foi possível carregar.");
  }

  useEffect(() => { carregar(); }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (usuarios ?? []).filter((u) => {
      if (setor && u.sector !== setor) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [usuarios, busca, setor]);

  const contagem = useMemo(() => {
    const m: Record<string, number> = {};
    for (const u of usuarios ?? []) m[u.sector] = (m[u.sector] ?? 0) + 1;
    return m;
  }, [usuarios]);

  async function salvar() {
    if (!modal) return;
    const { form, editando } = modal;
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(
        editando ? `/api/tickets/usuarios/${encodeURIComponent(form.email)}` : "/api/tickets/usuarios",
        {
          method: editando ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível salvar."); return; }
      setModal(null);
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function remover(email: string) {
    if (!confirm(`Remover ${email}?`)) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/tickets/usuarios/${encodeURIComponent(email)}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível remover."); return; }
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      {erro && <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 text-sm rounded-lg px-4 py-3">{erro}</div>}

      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          onClick={() => setSetor("")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition ${
            setor === "" ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          Todos<span className="text-[11px] text-slate-400 dark:text-slate-500 ml-1">{(usuarios ?? []).length}</span>
        </button>
        {SETORES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSetor(s.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition ${
              setor === s.id ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            {s.nome}
            {contagem[s.id] ? <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-1">{contagem[s.id]}</span> : null}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          className={`${INPUT} flex-1 min-w-[200px]`}
          placeholder="Buscar por nome ou e-mail…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button className={BTN_PRIMARY} onClick={() => setModal({ editando: false, form: { ...VAZIO } })}>
          + Adicionar usuário
        </button>
        <span className="text-xs text-slate-500 ml-auto">{filtrados.length} de {(usuarios ?? []).length}</span>
      </div>

      <div className={`${CARD} overflow-hidden overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-left text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5">Nome</th>
              <th className="px-4 py-2.5">E-mail</th>
              <th className="px-4 py-2.5">Setor</th>
              <th className="px-4 py-2.5">Sub-admin</th>
              <th className="px-4 py-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((u) => (
              <tr key={u.email} className="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="px-4 py-2.5">{u.name}</td>
                <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{u.email}</td>
                <td className="px-4 py-2.5">{SETOR_NOME[u.sector] ?? u.sector}</td>
                <td className="px-4 py-2.5">
                  {u.is_sub_admin ? <span className="text-emerald-600 dark:text-emerald-400">Sim</span> : <span className="text-slate-300 dark:text-slate-600">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <button
                    onClick={() => setModal({
                      editando: true,
                      form: { email: u.email, name: u.name, sector: u.sector, is_sub_admin: u.is_sub_admin },
                    })}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mr-3"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => remover(u.email)}
                    disabled={salvando || u.email === meuEmail}
                    title={u.email === meuEmail ? "Você não pode remover a si mesmo" : "Remover"}
                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed"
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
            {usuarios !== null && filtrados.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500 text-sm">Nenhum usuário encontrado.</td></tr>
            )}
            {usuarios === null && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500 text-sm">Carregando…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl text-slate-900 dark:text-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-semibold">{modal.editando ? "Editar usuário" : "Novo usuário"}</h2>
              <button
                onClick={() => setModal(null)}
                aria-label="Fechar"
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {erro && <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 text-sm rounded-lg px-4 py-3">{erro}</div>}
              <label className="block">
                <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Nome</span>
                <input
                  className={`${INPUT} w-full`}
                  value={modal.form.name}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, name: e.target.value } })}
                />
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">E-mail</span>
                <input
                  className={`${INPUT} w-full disabled:opacity-50`}
                  value={modal.form.email}
                  disabled={modal.editando}
                  onChange={(e) => setModal({ ...modal, form: { ...modal.form, email: e.target.value } })}
                  placeholder="email@phdcontabil.com.br"
                />
              </label>
              <div className="grid grid-cols-2 gap-3 items-end">
                <label className="block">
                  <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Setor</span>
                  <select
                    className={`${INPUT} w-full`}
                    value={modal.form.sector}
                    onChange={(e) => setModal({ ...modal, form: { ...modal.form, sector: e.target.value } })}
                  >
                    {SETORES.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 pb-2.5">
                  <input
                    type="checkbox"
                    checked={modal.form.is_sub_admin}
                    onChange={(e) => setModal({ ...modal, form: { ...modal.form, is_sub_admin: e.target.checked } })}
                  />
                  <span>Sub-admin (edita horas/valores do setor)</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button className={BTN} onClick={() => setModal(null)}>Cancelar</button>
              <button
                className={BTN_PRIMARY}
                onClick={salvar}
                disabled={salvando || !modal.form.name.trim() || !modal.form.email.trim()}
              >
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
