"use client";

import { Fragment, useState, useTransition } from "react";
import type { SocietalActivity } from "@/lib/societario/tareffa";
import { SITUACOES_ATIVIDADE } from "@/lib/societario/options";
import { formatDate } from "@/lib/societario/tareffa";

interface Props {
  processoId: number;
  atividades: SocietalActivity[];
  onUpdate: (
    processoId: number,
    activityId: number,
    situation: string
  ) => Promise<void>;
  onObs?: (processoId: number, activityId: number, obs: string) => Promise<void>;
}

export function AtividadesTable({ processoId, atividades, onUpdate, onObs }: Props) {
  const [savingId, setSavingId] = useState<number | null>(null);
  const [sit, setSit] = useState<Record<number, string>>({});
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
    setSit((m) => ({ ...m, [activityId]: value }));
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
            <Fragment key={a.id}>
            <tr className="border-t align-middle">
              <td className="px-4 py-2.5 text-gray-500">{a.order}</td>
              <td className="px-4 py-2.5">{a.name}</td>
              <td className="px-4 py-2.5 text-gray-600">
                {a.responsible || "—"}
              </td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <select
                    value={(sit[a.id] ?? a.situation) || ""}
                    onChange={(e) => handleChange(a.id, e.target.value)}
                    disabled={savingId === a.id}
                    className="border border-gray-300 rounded px-2 py-1 text-xs flex-1 bg-white"
                  >
                    <option value="">— escolher —</option>
                    {[...new Set([...SITUACOES_ATIVIDADE, ...(a.situation ? [a.situation] : [])])].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
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
            <tr>
              <td colSpan={6} className="px-4 pb-3 pt-0">
                <Observacao
                  valor={a.obs || ""}
                  salvando={savingId === a.id}
                  desabilitado={!onObs}
                  onSalvar={(v) => {
                    if (!onObs || v === (a.obs || "")) return;
                    setSavingId(a.id);
                    startTransition(async () => { await onObs(processoId, a.id, v); setSavingId(null); });
                  }}
                />
              </td>
            </tr>
            </Fragment>
          ))}
      </tbody>
    </table>
  );
}

/** Observação da atividade: ocupa a largura toda, cresce conforme o texto (até ~14 linhas) e salva ao sair do campo. */
function Observacao({ valor, salvando, desabilitado, onSalvar }: { valor: string; salvando: boolean; desabilitado: boolean; onSalvar: (v: string) => void }) {
  const [texto, setTexto] = useState(valor);
  const [aberto, setAberto] = useState(false);
  const linhas = Math.min(14, Math.max(2, texto.split("\n").length + Math.floor(texto.length / 160)));
  if (!texto && !aberto) {
    return (
      <button type="button" disabled={desabilitado} onClick={() => setAberto(true)}
        className="text-xs text-gray-400 hover:text-brand-700 italic">
        + Adicionar observação
      </button>
    );
  }
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50/70 dark:bg-transparent">
      <div className="flex items-center justify-between px-3 pt-1.5 text-[11px] uppercase tracking-wide text-gray-400">
        <span>Observação</span>
        {salvando && <span className="normal-case tracking-normal text-gray-500">salvando…</span>}
      </div>
      <textarea
        value={texto}
        rows={linhas}
        autoFocus={aberto && !valor}
        disabled={desabilitado}
        placeholder="Escreva a observação…"
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => { onSalvar(texto); if (!texto) setAberto(false); }}
        className="block w-full bg-transparent px-3 pb-2 pt-1 text-[13px] leading-relaxed text-gray-800 outline-none resize-y"
      />
    </div>
  );
}
