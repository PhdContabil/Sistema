"use client";

import { useState, useTransition } from "react";
import type { SocietalActivity } from "@/lib/societario/tareffa";
import { STATUS_PROCESSO } from "@/lib/societario/options";
import { formatDate } from "@/lib/societario/tareffa";
import { StatusPill } from "@/components/societario/StatusPill";

interface Props {
  processoId: number;
  atividades: SocietalActivity[];
  onUpdate: (
    processoId: number,
    activityId: number,
    situation: string
  ) => Promise<void>;
}

export function AtividadesTable({ processoId, atividades, onUpdate }: Props) {
  const [savingId, setSavingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  if (atividades.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-gray-500">
        Sem atividades registradas.
      </p>
    );
  }

  function handleChange(activityId: number, value: string) {
    setSavingId(activityId);
    startTransition(async () => {
      await onUpdate(processoId, activityId, value);
      setSavingId(null);
    });
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-left text-gray-600 text-xs uppercase">
        <tr>
          <th className="px-4 py-2.5">Ordem</th>
          <th className="px-4 py-2.5">Atividade</th>
          <th className="px-4 py-2.5">Responsável</th>
          <th className="px-4 py-2.5 w-56">Situação</th>
          <th className="px-4 py-2.5">Prazo</th>
          <th className="px-4 py-2.5">Encerrada</th>
        </tr>
      </thead>
      <tbody>
        {atividades
          .slice()
          .sort((a, b) => (a.order || "").localeCompare(b.order || ""))
          .map((a) => (
            <tr key={a.id} className="border-t align-middle">
              <td className="px-4 py-2.5 text-gray-500">{a.order}</td>
              <td className="px-4 py-2.5">{a.name}</td>
              <td className="px-4 py-2.5 text-gray-600">
                {a.responsible || "—"}
              </td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <select
                    defaultValue={a.situation || ""}
                    onChange={(e) => handleChange(a.id, e.target.value)}
                    disabled={savingId === a.id}
                    className="border border-gray-300 rounded px-2 py-1 text-xs flex-1 bg-white"
                  >
                    <option value="">— escolher —</option>
                    {STATUS_PROCESSO.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {a.situation && (
                    <span className="hidden lg:inline">
                      <StatusPill status={a.situation} />
                    </span>
                  )}
                  {savingId === a.id && (
                    <span className="text-[10px] text-gray-500">
                      salvando…
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-2.5 text-gray-600">
                {formatDate(a.deadline_in)}
              </td>
              <td className="px-4 py-2.5 text-gray-600">
                {formatDate(a.closed_in)}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}
