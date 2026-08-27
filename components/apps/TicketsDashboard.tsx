"use client";

import { useEffect, useState } from "react";
import {
  SETORES, STATUS, SETOR_NOME, STATUS_NOME, PRIORIDADE_NOME,
  primeiroNome, tempoRelativo, type Ticket,
} from "@/lib/tickets";
import { INPUT, BTN, BTN_PRIMARY, CARD } from "./TicketsBoard";

interface Filtros {
  busca: string;
  setor: string;
  status: string;
  responsavel: string;
  criadoDe: string;
  criadoAte: string;
  finalizadoDe: string;
  finalizadoAte: string;
}

const VAZIO: Filtros = {
  busca: "", setor: "", status: "", responsavel: "",
  criadoDe: "", criadoAte: "", finalizadoDe: "", finalizadoAte: "",
};

export default function TicketsDashboard() {
  const [filtros, setFiltros] = useState<Filtros>(VAZIO);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [msgSync, setMsgSync] = useState<string | null>(null);
  const [erroSync, setErroSync] = useState<string | null>(null);

  async function sincronizar() {
    setSincronizando(true);
    setMsgSync(null);
    setErroSync(null);
    try {
      const r = await fetch("/api/tickets/sincronizar", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.erro) { setErroSync(j.erro ?? "Não foi possível sincronizar."); return; }
      const { novosTickets, comentarios, anexos, atribuicoes } = j;
      setMsgSync(
        novosTickets === 0
          ? "Já está tudo em dia — nenhum ticket novo encontrado no sistema antigo."
          : `Trazidos ${novosTickets} ticket${novosTickets === 1 ? "" : "s"} novo${novosTickets === 1 ? "" : "s"} (${comentarios} comentário${comentarios === 1 ? "" : "s"}, ${anexos} anexo${anexos === 1 ? "" : "s"}, ${atribuicoes} atribuição${atribuicoes === 1 ? "" : "ões"}).`
      );
      if (novosTickets > 0) await buscar(filtros);
    } finally {
      setSincronizando(false);
    }
  }

  async function buscar(f: Filtros) {
    setCarregando(true);
    setErro(null);
    try {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
      const r = await fetch(`/api/tickets/dashboard?${p.toString()}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível carregar."); return; }
      setTickets(j.tickets ?? []);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { buscar(VAZIO); }, []);

  function campo<K extends keyof Filtros>(k: K, v: Filtros[K]) {
    setFiltros((f) => ({ ...f, [k]: v }));
  }

  return (
    <>
      {erro && <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 text-sm rounded-lg px-4 py-3">{erro}</div>}

      <div className={`${CARD} p-4 mb-4 flex flex-wrap items-center gap-3`}>
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-white">Sistema antigo de tickets</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Ainda em uso — traga manualmente o que foi criado por lá e ainda não está aqui.
          </div>
        </div>
        <button className={`${BTN} ml-auto`} onClick={sincronizar} disabled={sincronizando}>
          {sincronizando ? "Sincronizando…" : "Sincronizar tickets"}
        </button>
      </div>
      {msgSync && <div className="mb-4 bg-green-50 dark:bg-green-900/30 border border-green-300 dark:border-green-800 text-green-700 dark:text-green-200 text-sm rounded-lg px-4 py-3">{msgSync}</div>}
      {erroSync && <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 text-sm rounded-lg px-4 py-3">{erroSync}</div>}

      <div className={`${CARD} p-4 mb-4`}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Buscar</span>
            <input
              className={`${INPUT} w-full`}
              value={filtros.busca}
              onChange={(e) => campo("busca", e.target.value)}
              placeholder="Título ou descrição…"
            />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Setor</span>
            <select className={`${INPUT} w-full`} value={filtros.setor} onChange={(e) => campo("setor", e.target.value)}>
              <option value="">Todos</option>
              {SETORES.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Status</span>
            <select className={`${INPUT} w-full`} value={filtros.status} onChange={(e) => campo("status", e.target.value)}>
              <option value="">Todos</option>
              {STATUS.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Responsável (e-mail)</span>
            <input
              className={`${INPUT} w-full`}
              value={filtros.responsavel}
              onChange={(e) => campo("responsavel", e.target.value)}
              placeholder="email@phdcontabil.com.br"
            />
          </label>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Criado de</span>
            <input type="date" className={`${INPUT} w-full`} value={filtros.criadoDe} onChange={(e) => campo("criadoDe", e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Criado até</span>
            <input type="date" className={`${INPUT} w-full`} value={filtros.criadoAte} onChange={(e) => campo("criadoAte", e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Finalizado de</span>
            <input type="date" className={`${INPUT} w-full`} value={filtros.finalizadoDe} onChange={(e) => campo("finalizadoDe", e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-slate-500 mb-1.5">Finalizado até</span>
            <input type="date" className={`${INPUT} w-full`} value={filtros.finalizadoAte} onChange={(e) => campo("finalizadoAte", e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button className={BTN_PRIMARY} onClick={() => buscar(filtros)} disabled={carregando}>
            {carregando ? "Aplicando…" : "Aplicar filtros"}
          </button>
          <button className={BTN} onClick={() => { setFiltros(VAZIO); buscar(VAZIO); }} disabled={carregando}>
            Limpar
          </button>
          {tickets !== null && (
            <span className="text-xs text-slate-500 ml-auto">
              {tickets.length} ticket{tickets.length === 1 ? "" : "s"}
              {tickets.length === 500 ? " (limite atingido)" : ""}
            </span>
          )}
        </div>
      </div>

      <div className={`${CARD} overflow-hidden overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-left text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5">Título</th>
              <th className="px-4 py-2.5">Setor</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Prioridade</th>
              <th className="px-4 py-2.5">Criado por</th>
              <th className="px-4 py-2.5">Responsáveis</th>
              <th className="px-4 py-2.5">Aberto há</th>
            </tr>
          </thead>
          <tbody>
            {(tickets ?? []).map((t) => (
              <tr key={t.id} className="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="px-4 py-2.5 max-w-xs">{t.title}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{SETOR_NOME[t.sector] ?? t.sector}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{STATUS_NOME[t.status] ?? t.status}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{PRIORIDADE_NOME[t.priority] ?? t.priority}</td>
                <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{primeiroNome(t.created_by_name, t.created_by_email)}</td>
                <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                  {t.responsaveis.length
                    ? t.responsaveis.map((r) => primeiroNome(r.user_name, r.user_email)).join(", ")
                    : "—"}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-slate-400 dark:text-slate-500">{tempoRelativo(t.created_at)}</td>
              </tr>
            ))}
            {tickets !== null && tickets.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500 text-sm">Nenhum ticket encontrado com esses filtros.</td></tr>
            )}
            {tickets === null && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500 text-sm">Carregando…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
