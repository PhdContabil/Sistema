"use client";
import { useState, useTransition } from "react";
import { STATUS_PROCESSO, statusClass } from "@/lib/societario/options";

export function StatusEditavel({ status, salvar }: { status: string; salvar: (s: string) => Promise<void> }) {
  const [valor, setValor] = useState(status);
  const [pend, start] = useTransition();
  const [erro, setErro] = useState("");
  const opcoes = (STATUS_PROCESSO as readonly string[]).includes(status) || !status ? STATUS_PROCESSO : [status, ...STATUS_PROCESSO];
  return (
    <span className="inline-flex items-center gap-2">
      <select
        value={valor}
        disabled={pend}
        title="Clique para mudar o status"
        onChange={(e) => {
          const novo = e.target.value, antigo = valor;
          setValor(novo); setErro("");
          start(async () => { try { await salvar(novo); } catch { setValor(antigo); setErro("Não salvou, tente de novo"); } });
        }}
        className={`status-pill ${statusClass(valor)} cursor-pointer border-0 pr-6`}
        style={{ appearance: "auto" }}
      >
        {!valor && <option value="">—</option>}
        {opcoes.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      {pend && <span className="text-xs text-gray-500">salvando…</span>}
      {erro && <span className="text-xs text-red-600">{erro}</span>}
    </span>
  );
}
