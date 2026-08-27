"use client";

import { useEffect, useState } from "react";
import { INPUT, BTN_PRIMARY, CARD } from "./TicketsBoard";

export default function TicketsAdmins({ meuEmail }: { meuEmail: string | null }) {
  const [admins, setAdmins] = useState<string[] | null>(null);
  const [novoEmail, setNovoEmail] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    const r = await fetch("/api/tickets/admins", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setAdmins(j.admins ?? []);
    else setErro(j.error ?? "Não foi possível carregar.");
  }

  useEffect(() => { carregar(); }, []);

  async function adicionar() {
    const email = novoEmail.trim().toLowerCase();
    if (!email) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/tickets/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível adicionar."); return; }
      setNovoEmail("");
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function remover(email: string) {
    if (!confirm(`Remover ${email} dos administradores?`)) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/tickets/admins?email=${encodeURIComponent(email)}`, { method: "DELETE" });
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

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={novoEmail}
          onChange={(e) => setNovoEmail(e.target.value)}
          placeholder="email@phdcontabil.com.br"
          className={`${INPUT} flex-1 min-w-[220px]`}
          onKeyDown={(e) => { if (e.key === "Enter") adicionar(); }}
        />
        <button className={BTN_PRIMARY} onClick={adicionar} disabled={salvando || !novoEmail.trim()}>
          + Adicionar admin
        </button>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-left text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5">E-mail</th>
              <th className="px-4 py-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(admins ?? []).map((email) => (
              <tr key={email} className="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="px-4 py-2.5">{email}</td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => remover(email)}
                    disabled={salvando || email === meuEmail}
                    title={email === meuEmail ? "Você não pode remover a si mesmo" : "Remover"}
                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed"
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
            {admins !== null && admins.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-6 text-center text-slate-500 text-sm">Nenhum admin cadastrado.</td></tr>
            )}
            {admins === null && (
              <tr><td colSpan={2} className="px-4 py-6 text-center text-slate-500 text-sm">Carregando…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
