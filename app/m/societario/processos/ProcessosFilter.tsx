"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RESPONSAVEIS, STATUS_PROCESSO } from "@/lib/societario/options";

interface Props {
  tipos: string[];
  initial: {
    q: string;
    tipo: string;
    status: string;
    responsavel: string;
    de: string;
    ate: string;
  };
}

export function ProcessosFilter({ tipos, initial }: Props) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const [tipo, setTipo] = useState(initial.tipo);
  const [status, setStatus] = useState(initial.status);
  const [responsavel, setResponsavel] = useState(initial.responsavel);
  const [de, setDe] = useState(initial.de);
  const [ate, setAte] = useState(initial.ate);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (tipo) params.set("tipo", tipo);
    if (status) params.set("status", status);
    if (responsavel) params.set("responsavel", responsavel);
    if (de) params.set("de", de);
    if (ate) params.set("ate", ate);
    const qs = params.toString();
    router.push(`/m/societario/processos${qs ? "?" + qs : ""}`);
  }

  function onClear() {
    setQ("");
    setTipo("");
    setStatus("");
    setResponsavel("");
    setDe("");
    setAte("");
    router.push("/m/societario/processos");
  }

  // Atalhos de período comuns
  function setPreset(days: number) {
    const today = new Date();
    const past = new Date();
    past.setDate(today.getDate() - days);
    setDe(past.toISOString().slice(0, 10));
    setAte(today.toISOString().slice(0, 10));
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white border border-gray-200 rounded-lg p-4 space-y-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Buscar</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Empresa, CNPJ, responsável..."
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Processo</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {tipos.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {STATUS_PROCESSO.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Responsável</label>
          <select
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {RESPONSAVEIS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">De</label>
          <input
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Até</label>
          <input
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </div>
        <div className="lg:col-span-3">
          <label className="block text-xs text-gray-500 mb-1">
            Atalhos de período
          </label>
          <div className="flex flex-wrap gap-1.5">
            <PresetBtn onClick={() => setPreset(7)}>Últimos 7 dias</PresetBtn>
            <PresetBtn onClick={() => setPreset(15)}>15 dias</PresetBtn>
            <PresetBtn onClick={() => setPreset(30)}>30 dias</PresetBtn>
            <PresetBtn onClick={() => setPreset(90)}>90 dias</PresetBtn>
            <PresetBtn onClick={() => setPreset(365)}>1 ano</PresetBtn>
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="bg-brand-700 hover:bg-brand-900 text-white text-sm font-medium rounded px-4 py-1.5"
        >
          Filtrar
        </button>
        <button
          type="button"
          onClick={onClear}
          className="text-sm text-gray-600 hover:text-gray-900 px-4 py-1.5 border border-gray-300 rounded hover:bg-gray-50"
        >
          Limpar
        </button>
      </div>
    </form>
  );
}

function PresetBtn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] text-gray-700 hover:text-brand-700 border border-gray-200 hover:border-brand-300 bg-gray-50 hover:bg-brand-50 rounded px-2 py-1"
    >
      {children}
    </button>
  );
}
