"use client";

import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Bucket {
  name: string;
  count: number;
}

const PALETTE = [
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

export function TipoBarsChart({ data }: { data: Bucket[] }) {
  const router = useRouter();
  const truncated = data.map((d) => ({
    ...d,
    short: d.name.length > 22 ? d.name.slice(0, 20) + "…" : d.name,
  }));

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="font-semibold mb-1">Por tipo de processo</h3>
      <p className="text-xs text-gray-500 mb-3">
        Clique numa barra para filtrar
      </p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={truncated}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 5, bottom: 5 }}
          >
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "var(--soc-muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="short"
              tick={{ fontSize: 11, fill: "var(--soc-text)" }}
              axisLine={false}
              tickLine={false}
              width={140}
            />
            <Tooltip
              cursor={{ fill: "rgba(124, 58, 237, 0.08)" }}
              contentStyle={{
                fontSize: 12,
                background: "var(--soc-card)",
                color: "var(--soc-text)",
                border: "1px solid var(--soc-border)",
                borderRadius: 6,
              }}
              labelStyle={{ color: "var(--soc-text)" }}
              itemStyle={{ color: "var(--soc-text)" }}
              formatter={(v: number, _n, p: any) => [v, p.payload.name]}
            />
            <Bar
              dataKey="count"
              radius={[0, 4, 4, 0]}
              onClick={(d: any) => {
                if (d?.name) {
                  router.push(`/m/societario/processos?tipo=${encodeURIComponent(d.name)}`);
                }
              }}
              cursor="pointer"
            >
              {truncated.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
