"use client";

import { useState, useTransition } from "react";
import type { ModeloAtividade } from "@/lib/societario/tipoAtividades";

interface Props {
  tipoId: string;
  inicial: ModeloAtividade[];
  sugestao: ModeloAtividade[];
  responsaveis: string[];
  salvar: (tipoId: string, itens: ModeloAtividade[]) => Promise<void>;
}

const VAZIA: ModeloAtividade = { nome: "", responsavel: "", dias: 0, obs: "" };

export function AtividadesTipoEditor({ tipoId, inicial, sugestao, responsaveis, salvar }: Props) {
  const [itens, setItens] = useState<ModeloAtividade[]>(inicial.length ? inicial : []);
  const [msg, setMsg] = useState<string | null>(null);
  const [salvando, startTransition] = useTransition();

  const set = (i: number, p: Partial<ModeloAtividade>) => setItens((c) => c.map((a, k) => (k === i ? { ...a, ...p } : a)));
  const mover = (i: number, d: -1 | 1) =>
    setItens((c) => {
      const j = i + d;
      if (j < 0 || j >= c.length) return c;
      const n = [...c];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  function gravar() {
    setMsg(null);
    startTransition(async () => {
      try {
        await salvar(tipoId, itens);
        setMsg("Atividades salvas.");
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Falha ao salvar.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {itens.length === 0 && sugestao.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm flex items-center justify-between gap-3">
          <span>
            Encontrei {sugestao.length} atividades usadas nos processos deste tipo vindos do Tareffa. Quer usar como ponto de partida?
          </span>
          <button type="button" onClick={() => setItens(sugestao)} className="bg-brand-700 text-white rounded px-3 py-1.5 text-sm">
            Importar do Tareffa
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 w-16">Ordem</th>
              <th className="px-3 py-2">Atividade *</th>
              <th className="px-3 py-2 w-48">Responsável</th>
              <th className="px-3 py-2 w-28">Prazo (dias úteis)</th>
              <th className="px-3 py-2">Observação (opcional)</th>
              <th className="px-3 py-2 w-24 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {itens.map((a, i) => (
              <tr key={i} className="border-t align-top">
                <td className="px-3 py-2 text-gray-500">
                  {String(i + 1).padStart(2, "0")}
                  <div className="flex gap-1 mt-1">
                    <button type="button" title="Subir" onClick={() => mover(i, -1)} className="text-gray-500 hover:text-gray-900">▲</button>
                    <button type="button" title="Descer" onClick={() => mover(i, 1)} className="text-gray-500 hover:text-gray-900">▼</button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <input value={a.nome} onChange={(e) => set(i, { nome: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1" placeholder="Ex.: Consulta de nome (JUCESP + INPI)" />
                </td>
                <td className="px-3 py-2">
                  <select value={a.responsavel} onChange={(e) => set(i, { responsavel: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1">
                    <option value="">(definir no processo)</option>
                    {responsaveis.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input type="number" min={0} value={a.dias} onChange={(e) => set(i, { dias: Number(e.target.value) })} className="w-full border border-gray-300 rounded px-2 py-1" />
                </td>
                <td className="px-3 py-2">
                  <textarea rows={1} value={a.obs ?? ""} onChange={(e) => set(i, { obs: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1" placeholder="Orientação para quem for executar" />
                </td>
                <td className="px-3 py-2 text-right">
                  <button type="button" onClick={() => setItens((c) => c.filter((_, k) => k !== i))} className="text-red-600 hover:text-red-800">Remover</button>
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-gray-500">Nenhuma atividade vinculada ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setItens((c) => [...c, { ...VAZIA }])} className="text-sm text-brand-700 hover:text-brand-900">
          + Adicionar atividade
        </button>
        <div className="flex items-center gap-3">
          {msg && <span className="text-sm text-gray-600">{msg}</span>}
          <button type="button" disabled={salvando} onClick={gravar} className="bg-brand-700 hover:bg-brand-900 text-white text-sm font-semibold rounded px-5 py-2 disabled:opacity-50">
            {salvando ? "Salvando…" : "Salvar atividades"}
          </button>
        </div>
      </div>
    </div>
  );
}
