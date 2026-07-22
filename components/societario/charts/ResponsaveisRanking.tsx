"use client";

import Link from "next/link";

interface Resp {
  name: string;
  count: number;
  abertos: number;
  concluidos: number;
}

// Gera iniciais a partir do nome
function initials(name: string): string {
  if (!name || name === "—") return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Gera uma cor estável a partir do nome
function bgFor(name: string): string {
  const palette = [
    "#7c3aed",
    "#ec4899",
    "#0ea5e9",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#14b8a6",
    "#8b5cf6",
    "#f97316",
    "#3b82f6",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function ResponsaveisRanking({ data }: { data: Resp[] }) {
  const max = data[0]?.count || 1;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="font-semibold mb-1">Top responsáveis</h3>
      <p className="text-xs text-gray-500 mb-4">
        Clique no nome para ver os processos do responsável
      </p>
      <ol className="space-y-2.5">
        {data.map((r, idx) => (
          <li key={r.name}>
            <Link
              href={`/m/societario/processos?responsavel=${encodeURIComponent(r.name)}`}
              className="flex items-center gap-3 hover:bg-gray-50 rounded-lg px-2 py-2 transition group"
            >
              <span className="text-xs font-bold text-gray-400 w-5 tabular-nums">
                {idx + 1}
              </span>
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
                style={{ background: bgFor(r.name) }}
              >
                {initials(r.name)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate group-hover:text-brand-700">
                  {r.name || "—"}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="bar-track flex-1">
                    <div
                      className="bar-fill"
                      style={{ width: `${(r.count / max) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold tabular-nums">{r.count}</div>
                <div className="text-[10px] text-gray-500">
                  <span className="text-emerald-600">{r.concluidos}</span>
                  {" / "}
                  <span className="text-amber-600">{r.abertos}</span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
      <p className="text-[10px] text-gray-400 mt-3">
        Legenda: <span className="text-emerald-600">concluídos</span> /{" "}
        <span className="text-amber-600">abertos</span>
      </p>
    </div>
  );
}
