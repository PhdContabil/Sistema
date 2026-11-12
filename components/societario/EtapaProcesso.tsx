"use client";

// Etapa atual do processo (aparece na lista de processos sem precisar abrir).
import { useState } from "react";

export function EtapaProcesso({ id, texto, rotulo }: { id: number; texto: string; rotulo: string }) {
  const [valor, setValor] = useState(texto);
  const [atual, setAtual] = useState(rotulo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true); setErro(null);
    try {
      const r = await fetch("/api/societario/etapa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, texto: valor }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErro(j.error ?? "Não foi possível salvar.");
      else setAtual(j.rotulo ?? "");
    } finally { setSalvando(false); }
  }

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4">
      <h2 className="font-semibold">Etapa atual</h2>
      <p className="text-xs text-gray-500 mb-2">Onde o processo está parado (aparece na lista de processos). Ex.: Aguardando pagamento.</p>
      <div className="flex gap-2">
        <input className="form-input flex-1" maxLength={200} value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: Aguardando pagamento" onKeyDown={(e) => { if (e.key === "Enter") salvar(); }} />
        <button className="px-3 py-1.5 rounded-lg text-sm bg-blue-600 text-white disabled:opacity-50" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar"}</button>
      </div>
      {atual && <p className="text-xs text-gray-600 mt-1">Na lista: <b>{atual}</b></p>}
      {erro && <p className="text-xs text-red-600 mt-1">{erro}</p>}
    </section>
  );
}
