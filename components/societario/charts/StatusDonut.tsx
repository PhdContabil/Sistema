"use client";

import { useRouter } from "next/navigation";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface Slice {
  name: string;
  count: number;
}

// Paleta consistente com o tema (status_class do globals.css)
const COLORS: Record<string, string> = {
  CONCLUÍDO: "#10b981",
  CANCELADO: "#9ca3af",
  "PARADO/SUSPENSO": "#f59e0b",
  "ALTA PRIORIDADE": "#ef4444",
  "MÉDIA PRIORIDADE": "#f97316",
  "BAIXA PRIORIDADE": "#0ea5e9",
  "AGUARDANDO CLIENTE": "#eab308",
  "AGUARDANDO CONCLUSÃO": "#a855f7",
  ACOMPANHAMENTO: "#3b82f6",
};
const FALLBACK = ["#6366f1", "#ec4899", "#14b8a6", "#f43f5e", "#84cc16"];

function colorFor(name: string, idx: number) {
  return COLORS[name] || FALLBACK[idx % FALLBACK.length];
}

export function StatusDonut({ data }: { data: Slice[] }) {
  const router = useRouter();
  const total = data.reduce((a, b) => a + b.count, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="font-semibold mb-2">Por status</h3>
      <p className="text-xs text-gray-500 mb-3">
        Clique numa fatia para filtrar
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="w-full sm:w-1/2 h-56 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
                onClick={(_, idx) => {
                  const item = data[idx];
                  if (item)
                    router.push(
                      `/m/societario/processos?status=${encodeURIComponent(item.name)}`
                    );
                }}
                cursor="pointer"
              >
                {data.map((d, i) => (
                  <Cell key={d.name} fill={colorFor(d.name, i)} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number, _n, p: any) => [
                  `${v} (${((v / total) * 100).toFixed(1)}%)`,
                  p.payload.name,
                ]}
                contentStyle={{
                  fontSize: 12,
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-2xl font-bold">{total}</div>
            <div className="text-[10px] text-gray-500 uppercase">total</div>
          </div>
        </div>
        <ul className="w-full sm:w-1/2 text-sm space-y-1.5">
          {data.map((d, i) => (
            <li key={d.name}>
              <a
                href={`/m/societario/processos?status=${encodeURIComponent(d.name)}`}
                className="flex items-center gap-2 hover:bg-gray-50 rounded px-1.5 py-1"
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ background: colorFor(d.name, i) }}
                />
                <span className="flex-1 truncate text-xs">{d.name}</span>
                <span className="text-xs font-medium tabular-nums">
                  {d.count}
                </span>
                <span className="text-[10px] text-gray-400 w-9 text-right tabular-nums">
                  {((d.count / total) * 100).toFixed(0)}%
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
