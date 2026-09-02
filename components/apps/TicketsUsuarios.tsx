"use client";

import { useEffect, useMemo, useState } from "react";
import { SETORES, SETOR_NOME, type PessoaTickets } from "@/lib/tickets";
import { MODULES } from "@/lib/modules";
import { INPUT, BTN, BTN_PRIMARY, CARD } from "./TicketsBoard";

interface FormState {
  email: string;
  name: string;
  sector: string;
}

const VAZIO: FormState = { email: "", name: "", sector: "contabil" };

// ---- Permissões por módulo/submódulo (apenas prévia visual, em memória) ----

type NivelPermissao = "herdado" | "liberado" | "bloqueado";

interface OverridesPessoa {
  modulos: Record<string, NivelPermissao>;
  apps: Record<string, Record<string, NivelPermissao>>;
}

const OVERRIDES_VAZIO: OverridesPessoa = { modulos: {}, apps: {} };

function contarPersonalizadas(o: OverridesPessoa | undefined): number {
  if (!o) return 0;
  let n = 0;
  for (const v of Object.values(o.modulos)) if (v !== "herdado") n++;
  for (const apps of Object.values(o.apps)) {
    for (const v of Object.values(apps)) if (v !== "herdado") n++;
  }
  return n;
}

const RADIOS: { valor: NivelPermissao; label: string; ativo: string }[] = [
  { valor: "herdado", label: "Padrão", ativo: "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200" },
  { valor: "liberado", label: "Liberar", ativo: "bg-emerald-500 text-white" },
  { valor: "bloqueado", label: "Bloquear", ativo: "bg-red-500 text-white" },
];

function Seletor({
  valor,
  onMudar,
  mostrarPadrao = true,
}: {
  valor: NivelPermissao;
  onMudar: (v: NivelPermissao) => void;
  mostrarPadrao?: boolean;
}) {
  const opcoes = mostrarPadrao ? RADIOS : RADIOS.filter((r) => r.valor !== "herdado");
  return (
    <div className="flex gap-1">
      {opcoes.map((r) => {
        const ativo = valor === r.valor;
        return (
          <button
            key={r.valor}
            type="button"
            onClick={() => onMudar(ativo ? "herdado" : r.valor)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
              ativo ? r.ativo : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

function PermissoesPorModulo({
  overrides,
  onMudar,
}: {
  overrides: OverridesPessoa;
  onMudar: (o: OverridesPessoa) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);

  function setModulo(id: string, v: NivelPermissao) {
    onMudar({ ...overrides, modulos: { ...overrides.modulos, [id]: v } });
  }

  function setApp(moduloId: string, appId: string, v: NivelPermissao) {
    onMudar({
      ...overrides,
      apps: {
        ...overrides.apps,
        [moduloId]: { ...(overrides.apps[moduloId] ?? {}), [appId]: v },
      },
    });
  }

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-200 dark:divide-slate-800">
      {MODULES.map((m) => {
        const nivelModulo = overrides.modulos[m.id] ?? "herdado";
        const apps = m.apps;
        const expandido = aberto === m.id;
        const nPersonalizadas =
          (nivelModulo !== "herdado" ? 1 : 0) +
          Object.values(overrides.apps[m.id] ?? {}).filter((v) => v !== "herdado").length;

        return (
          <div key={m.id}>
            <div className="flex items-center gap-2.5 px-3 py-2.5 bg-white dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setAberto(expandido ? null : m.id)}
                disabled={!apps || apps.length === 0}
                className="flex items-center gap-2.5 flex-1 min-w-0 text-left disabled:cursor-default"
              >
                <svg
                  viewBox="0 0 20 20"
                  className={`w-3.5 h-3.5 flex-shrink-0 text-slate-400 transition-transform ${expandido ? "rotate-90" : ""} ${!apps || apps.length === 0 ? "opacity-0" : ""}`}
                  fill="currentColor"
                >
                  <path d="M7 5l6 5-6 5V5z" />
                </svg>
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: m.color ?? "#64748b" }}
                />
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{m.name}</span>
                {nPersonalizadas > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex-shrink-0">
                    {nPersonalizadas} personalizada{nPersonalizadas > 1 ? "s" : ""}
                  </span>
                )}
              </button>
              <Seletor valor={nivelModulo} onMudar={(v) => setModulo(m.id, v)} />
            </div>

            {expandido && nivelModulo !== "bloqueado" && apps && apps.length > 0 && (
              <div className="bg-slate-50 dark:bg-slate-950/40 px-3 py-2 space-y-1.5">
                {apps.map((a) => {
                  const nivelApp = overrides.apps[m.id]?.[a.name] ?? "herdado";
                  return (
                    <div key={a.name} className="flex items-center gap-2.5 pl-6 py-1">
                      <span className="text-xs text-slate-600 dark:text-slate-400 flex-1 min-w-0 truncate">{a.name}</span>
                      <Seletor
                        valor={nivelApp}
                        onMudar={(v) => setApp(m.id, a.name, v)}
                        mostrarPadrao={false}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Avatar({ nome }: { nome: string }) {
  const iniciais = nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200 text-[11px] font-semibold flex-shrink-0">
      {iniciais || "?"}
    </span>
  );
}

export default function TicketsUsuarios({ meuEmail }: { meuEmail: string | null }) {
  const [usuarios, setUsuarios] = useState<PessoaTickets[] | null>(null);
  const [busca, setBusca] = useState("");
  const [setor, setSetor] = useState("");
  const [modal, setModal] = useState<{ editando: boolean; form: FormState } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [overridesPorEmail, setOverridesPorEmail] = useState<Record<string, OverridesPessoa>>({});
  const [overridesModal, setOverridesModal] = useState<OverridesPessoa>(OVERRIDES_VAZIO);

  async function carregar() {
    const r = await fetch("/api/tickets/usuarios", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const lista: PessoaTickets[] = j.usuarios ?? [];
      setUsuarios(lista);
      // Carrega as permissões personalizadas de todo mundo pra já mostrar o
      // selo "N personalizada(s)" na tabela, sem precisar abrir cada edição.
      const pares = await Promise.all(
        lista.map(async (u) => {
          const rp = await fetch(`/api/tickets/usuarios/${encodeURIComponent(u.email)}/permissoes`, { cache: "no-store" });
          const jp = await rp.json().catch(() => ({}));
          return [u.email, rp.ok ? (jp.overrides as OverridesPessoa) : OVERRIDES_VAZIO] as const;
        })
      );
      setOverridesPorEmail(Object.fromEntries(pares));
    } else {
      setErro(j.error ?? "Não foi possível carregar.");
    }
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

  function abrirEdicao(u: PessoaTickets) {
    setOverridesModal(overridesPorEmail[u.email] ?? OVERRIDES_VAZIO);
    setModal({
      editando: true,
      form: { email: u.email, name: u.name, sector: u.sector },
    });
  }

  function abrirNovo() {
    setOverridesModal(OVERRIDES_VAZIO);
    setModal({ editando: false, form: { ...VAZIO } });
  }

  async function salvar() {
    if (!modal) return;
    const { form, editando } = modal;
    setSalvando(true);
    setErro(null);
    try {
      // Mantém o is_sub_admin já existente da pessoa (campo removido desta tela,
      // mas ainda usado em outras partes do sistema) em vez de sempre zerar.
      const existente = usuarios?.find((u) => u.email === form.email);
      const body = { ...form, is_sub_admin: existente?.is_sub_admin ?? false };
      const r = await fetch(
        editando ? `/api/tickets/usuarios/${encodeURIComponent(form.email)}` : "/api/tickets/usuarios",
        {
          method: editando ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível salvar."); return; }

      if (editando) {
        const rp = await fetch(`/api/tickets/usuarios/${encodeURIComponent(form.email)}/permissoes`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(overridesModal),
        });
        const jp = await rp.json().catch(() => ({}));
        if (!rp.ok) { setErro(jp.error ?? "Usuário salvo, mas as permissões não foram salvas."); return; }
      }

      setOverridesPorEmail((o) => ({ ...o, [form.email]: overridesModal }));
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
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition ${
            setor === "" ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          Todos<span className="text-[11px] opacity-70 ml-1.5">{(usuarios ?? []).length}</span>
        </button>
        {SETORES.map((s) => {
          const ativo = setor === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSetor(s.id)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition ${
                ativo ? "bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {s.nome}
              {contagem[s.id] ? <span className="text-[11px] opacity-70 ml-1.5">{contagem[s.id]}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <svg viewBox="0 0 20 20" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <circle cx="9" cy="9" r="6" />
            <path d="M17 17l-4-4" strokeLinecap="round" />
          </svg>
          <input
            className={`${INPUT} w-full pl-9`}
            placeholder="Buscar por nome ou e-mail…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <button className={`${BTN_PRIMARY} inline-flex items-center gap-1.5`} onClick={abrirNovo}>
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor"><path d="M10 4a1 1 0 011 1v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V5a1 1 0 011-1z" /></svg>
          Adicionar usuário
        </button>
        <span className="text-xs text-slate-500 ml-auto">{filtrados.length} de {(usuarios ?? []).length}</span>
      </div>

      <div className={`${CARD} overflow-hidden overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-left text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5">Nome</th>
              <th className="px-4 py-2.5">E-mail</th>
              <th className="px-4 py-2.5 text-center">Setor</th>
              <th className="px-4 py-2.5">Permissões</th>
              <th className="px-4 py-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((u) => {
              const n = contarPersonalizadas(overridesPorEmail[u.email]);
              return (
                <tr key={u.email} className="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar nome={u.name} />
                      <span>{u.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{u.email}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {SETOR_NOME[u.sector] ?? u.sector}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {n > 0 ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                        {n} personalizada{n > 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">Padrão do setor</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => abrirEdicao(u)}
                      title="Editar"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 mr-1"
                    >
                      <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-8.5 8.5a2 2 0 01-.878.507l-3 .857a.5.5 0 01-.62-.62l.857-3a2 2 0 01.507-.878l8.5-8.5z" /></svg>
                    </button>
                    <button
                      onClick={() => remover(u.email)}
                      disabled={salvando || u.email === meuEmail}
                      title={u.email === meuEmail ? "Você não pode remover a si mesmo" : "Remover"}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor"><path fillRule="evenodd" d="M8 2a1 1 0 00-1 1v1H4a1 1 0 000 2h12a1 1 0 100-2h-3V3a1 1 0 00-1-1H8zM5 7a1 1 0 011 1v8a2 2 0 002 2h4a2 2 0 002-2V8a1 1 0 112 0v8a4 4 0 01-4 4H8a4 4 0 01-4-4V8a1 1 0 011-1z" clipRule="evenodd" /></svg>
                    </button>
                  </td>
                </tr>
              );
            })}
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
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl text-slate-900 dark:text-slate-200 max-h-[90vh] overflow-y-auto"
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

              {modal.editando && (
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="block text-xs uppercase tracking-widest text-slate-500">Acesso a módulos e submódulos</span>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
                    Só T.I. e Diretoria veem isto. Fica salvo ao clicar em "Salvar".
                  </p>
                  <PermissoesPorModulo overrides={overridesModal} onMudar={setOverridesModal} />
                </div>
              )}
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
