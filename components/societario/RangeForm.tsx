"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function RangeForm({
  basePath,
  defaultMode,
  defaultFrom,
  defaultTo,
}: {
  basePath: string;
  defaultMode: "started" | "updated";
  defaultFrom: string;
  defaultTo: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [mode, setMode] = useState<"started" | "updated">(
    (sp.get("mode") as "started" | "updated") || defaultMode
  );
  const [from, setFrom] = useState(sp.get("from") || defaultFrom);
  const [to, setTo] = useState(sp.get("to") || defaultTo);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qs = new URLSearchParams({ mode, from, to });
    router.push(`${basePath}?${qs.toString()}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap gap-3 items-end"
    >
      <div>
        <label className="block text-xs text-gray-500 mb-1">Filtrar por</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "started" | "updated")}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="updated">Atualização</option>
          <option value="started">Início</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">De</label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Até</label>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        className="bg-brand-700 hover:bg-brand-900 text-white text-sm font-medium rounded px-4 py-1.5"
      >
        Buscar
      </button>
      <p className="text-[11px] text-gray-500 w-full">
        A API do Tareffa aceita no máximo 31 dias por consulta.
      </p>
    </form>
  );
}
