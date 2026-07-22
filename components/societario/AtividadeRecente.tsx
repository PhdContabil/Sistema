"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { canonicalResponsavel } from "@/lib/societario/options";

interface ProcessoMin {
  started_in: string;
  updated_in: string;
  process: string;
  bearer: string | null;
  status: string;
}

interface Props {
  processos: ProcessoMin[];
}

/** YYYY-MM-DD de N dias atrás (00:00 local) */
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD de hoje */
function isoToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/** dd/mm/aaaa */
function fmtBR(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function AtividadeRecente({ processos }: Props) {
  // Default: últimos 7 dias
  const [de, setDe] = useState<string>(() => isoDaysAgo(7));
  const [ate, setAte] = useState<string>(() => isoToday());

  const data = useMemo(() => {
    // started_in chega como ISO ("YYYY-MM-DD" ou datetime), basta comparar prefixo
    const filtered = processos.filter((p) => {
      const startedDay = (p.started_in || "").slice(0, 10);
      if (!startedDay) return false;
      if (de && startedDay < de) return false;
      if (ate && startedDay > ate) return false;
      return true;
    });

    const porTipo = new Map<string, number>();
    const porResp = new Map<
      string,
      { total: number; concluido: number; aberto: number }
    >();

    for (const p of filtered) {
      porTipo.set(p.process, (porTipo.get(p.process) || 0) + 1);
      const r = canonicalResponsavel(p.bearer);
      if (r) {
        const cur = porResp.get(r) || { total: 0, concluido: 0, aberto: 0 };
        cur.total++;
        const s = p.status.toUpperCase();
        if (s.includes("CONCL")) cur.concluido++;
        else if (!s.includes("CANCEL")) cur.aberto++;
        porResp.set(r, cur);
      }
    }

    const topTipos = Array.from(porTipo.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const porPessoa = Array.from(porResp.entries())
      .map(([name, b]) => ({ name, ...b }))
      .sort((a, b) => b.total - a.total);

    return { total: filtered.length, topTipos, porPessoa };
  }, [processos, de, ate]);

  function setPreset(days: number) {
    setDe(isoDaysAgo(days));
    setAte(isoToday());
  }

  function clearDates() {
    setDe("");
    setAte("");
  }

  // Texto descritivo do período selecionado
  const periodoLabel = (() => {
    if (de && ate) return `de ${fmtBR(de)} a ${fmtBR(ate)}`;
    if (de) return `a partir de ${fmtBR(de)}`;
    if (ate) return `até ${fmtBR(ate)}`;
    return "em todo o histórico";
  })();

  // Params usados nos links pra /m/societario/processos
  const linkParams = `${de ? `&de=${de}` : ""}${ate ? `&ate=${ate}` : ""}`;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">Atividade recente</h3>
          <p className="text-xs text-gray-500">
            {data.total} processos iniciados {periodoLabel}
          </p>
        </div>
      </div>

      {/* Date range filter — mesmo padrão do TimelineChart */}
      <div className="flex flex-wrap items-end gap-2 mb-3 pb-3 border-b border-gray-100">
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">De</label>
          <input
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-xs"
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">Até</label>
          <input
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-xs"
          />
        </div>
        <div className="flex gap-1 ml-1">
          <button
            type="button"
            onClick={() => setPreset(7)}
            className="text-[10px] text-gray-700 hover:text-brand-700 border border-gray-200 hover:border-brand-300 bg-gray-50 hover:bg-brand-50 rounded px-2 py-1"
          >
            7d
          </button>
          <button
            type="button"
            onClick={() => setPreset(30)}
            className="text-[10px] text-gray-700 hover:text-brand-700 border border-gray-200 hover:border-brand-300 bg-gray-50 hover:bg-brand-50 rounded px-2 py-1"
          >
            30d
          </button>
          <button
            type="button"
            onClick={() => setPreset(90)}
            className="text-[10px] text-gray-700 hover:text-brand-700 border border-gray-200 hover:border-brand-300 bg-gray-50 hover:bg-brand-50 rounded px-2 py-1"
          >
            90d
          </button>
          {(de || ate) && (
            <button
              type="button"
              onClick={clearDates}
              className="text-[10px] text-red-600 hover:text-red-800 border border-red-200 rounded px-2 py-1"
            >
              limpar
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
        {/* Top 5 tipos */}
        <div>
          <h4 className="text-[11px] uppercase tracking-wider text-gray-500 mb-2 font-semibold">
            Top 5 processos
          </h4>
          {data.topTipos.length === 0 ? (
            <p className="text-sm text-gray-400">Sem dados no período.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.topTipos.map((t, i) => {
                const max = data.topTipos[0].count;
                return (
                  <li key={t.name}>
                    <Link
                      href={`/m/societario/processos?tipo=${encodeURIComponent(
                        t.name
                      )}${linkParams}`}
                      className="block text-sm hover:bg-gray-50 rounded px-1.5 py-1"
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="truncate">
                          <span className="text-gray-400 mr-1.5 text-xs">
                            {i + 1}.
                          </span>
                          {t.name}
                        </span>
                        <span className="font-bold tabular-nums text-brand-700">
                          {t.count}
                        </span>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ width: `${(t.count / max) * 100}%` }}
                        />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Por responsável */}
        <div>
          <h4 className="text-[11px] uppercase tracking-wider text-gray-500 mb-2 font-semibold">
            Por responsável
          </h4>
          {data.porPessoa.length === 0 ? (
            <p className="text-sm text-gray-400">Sem dados no período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase text-gray-400 text-left">
                  <th className="py-1 font-medium">Pessoa</th>
                  <th className="py-1 font-medium text-center">Abertos</th>
                  <th className="py-1 font-medium text-center">Concl.</th>
                  <th className="py-1 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.porPessoa.map((r) => (
                  <tr key={r.name} className="border-t">
                    <td className="py-1.5">
                      <Link
                        href={`/m/societario/processos?responsavel=${encodeURIComponent(
                          r.name
                        )}${linkParams}`}
                        className="font-medium hover:underline"
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className="py-1.5 text-center text-amber-600 tabular-nums">
                      {r.aberto || "—"}
                    </td>
                    <td className="py-1.5 text-center text-emerald-600 tabular-nums">
                      {r.concluido || "—"}
                    </td>
                    <td className="py-1.5 text-right font-bold tabular-nums">
                      {r.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
