"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface MesPoint {
  mes: string; // YYYY-MM
  count: number;
  abertos: number;
  concluidos: number;
}
interface SemanaPoint {
  semana: string; // YYYY-Www
  count: number;
  abertos: number;
  concluidos: number;
}

type Periodo = "semana" | "mes" | "ano";

function fmtMes(s: string): string {
  if (!/^\d{4}-\d{2}$/.test(s)) return s;
  const [y, m] = s.split("-");
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[Number(m) - 1]}/${y.slice(2)}`;
}

function fmtSemana(s: string): string {
  if (!/^\d{4}-W\d{2}$/.test(s)) return s;
  const [y, w] = s.split("-W");
  return `S${w}/${y.slice(2)}`;
}

function aggregateByYear(mes: MesPoint[]) {
  const map = new Map<string, { count: number; abertos: number; concluidos: number }>();
  for (const m of mes) {
    const y = m.mes.slice(0, 4);
    const cur = map.get(y) || { count: 0, abertos: 0, concluidos: 0 };
    cur.count += m.count;
    cur.abertos += m.abertos;
    cur.concluidos += m.concluidos;
    map.set(y, cur);
  }
  return Array.from(map.entries())
    .map(([ano, b]) => ({ ano, ...b }))
    .sort((a, b) => a.ano.localeCompare(b.ano));
}

export function TimelineChart({
  mes,
  semana,
}: {
  mes: MesPoint[];
  semana: SemanaPoint[];
}) {
  const router = useRouter();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  // Aplica o filtro de data range
  const mesFiltrado = useMemo(() => {
    if (!de && !ate) return mes;
    const deYM = de ? de.slice(0, 7) : "";
    const ateYM = ate ? ate.slice(0, 7) : "";
    return mes.filter((m) => {
      if (deYM && m.mes < deYM) return false;
      if (ateYM && m.mes > ateYM) return false;
      return true;
    });
  }, [mes, de, ate]);

  const semanaFiltrada = useMemo(() => {
    if (!de && !ate) return semana;
    // Converte de/ate em semanas ISO aproximadas YYYY-Www
    const inRange = (semKey: string) => {
      const [y, wStr] = semKey.split("-W");
      const week = Number(wStr);
      // Aproxima: semana = day-of-year/7
      const date = new Date(Date.UTC(Number(y), 0, 1 + (week - 1) * 7));
      const iso = date.toISOString().slice(0, 10);
      if (de && iso < de) return false;
      if (ate && iso > ate) return false;
      return true;
    };
    return semana.filter((s) => inRange(s.semana));
  }, [semana, de, ate]);

  const { data, paramKey } = useMemo(() => {
    if (periodo === "semana") {
      return {
        data: semanaFiltrada.map((s) => ({
          ...s,
          key: s.semana,
          label: fmtSemana(s.semana),
        })),
        paramKey: "semana",
      };
    }
    if (periodo === "ano") {
      return {
        data: aggregateByYear(mesFiltrado).map((y) => ({
          ...y,
          key: y.ano,
          label: y.ano,
        })),
        paramKey: "ano",
      };
    }
    return {
      data: mesFiltrado.map((m) => ({
        ...m,
        key: m.mes,
        label: fmtMes(m.mes),
      })),
      paramKey: "mes",
    };
  }, [periodo, mesFiltrado, semanaFiltrada]);

  function setPreset(days: number) {
    const today = new Date();
    const past = new Date();
    past.setDate(today.getDate() - days);
    setDe(past.toISOString().slice(0, 10));
    setAte(today.toISOString().slice(0, 10));
  }

  function clearDates() {
    setDe("");
    setAte("");
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">Processos ao longo do tempo</h3>
          <p className="text-xs text-gray-500">Clique num ponto para filtrar</p>
        </div>
        <div className="inline-flex rounded-md border border-gray-200 overflow-hidden text-xs">
          {(["semana", "mes", "ano"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`px-3 py-1.5 font-medium ${
                periodo === p
                  ? "bg-brand-700 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {p === "semana" ? "Semana" : p === "mes" ? "Mês" : "Ano"}
            </button>
          ))}
        </div>
      </div>

      {/* Date range filter */}
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
          <button
            type="button"
            onClick={() => setPreset(365)}
            className="text-[10px] text-gray-700 hover:text-brand-700 border border-gray-200 hover:border-brand-300 bg-gray-50 hover:bg-brand-50 rounded px-2 py-1"
          >
            1 ano
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

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            onClick={(state: any) => {
              const payload = state?.activePayload?.[0]?.payload;
              if (payload?.key) {
                router.push(
                  `/m/societario/processos?${paramKey}=${encodeURIComponent(payload.key)}`
                );
              }
            }}
          >
            <defs>
              <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gConcl" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--soc-border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--soc-muted)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--soc-border)" }}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--soc-muted)" }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                background: "var(--soc-card)",
                color: "var(--soc-text)",
                border: "1px solid var(--soc-border)",
                borderRadius: 6,
              }}
              labelStyle={{ fontWeight: 600, color: "var(--soc-text)" }}
              itemStyle={{ color: "var(--soc-text)" }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              iconType="circle"
            />
            <Area
              type="monotone"
              dataKey="count"
              name="Total"
              stroke="#7c3aed"
              strokeWidth={2}
              fill="url(#gTotal)"
              dot={{ r: 3, strokeWidth: 0, fill: "#7c3aed" }}
              activeDot={{ r: 5, cursor: "pointer" }}
            />
            <Area
              type="monotone"
              dataKey="concluidos"
              name="Concluídos"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#gConcl)"
              dot={{ r: 2, strokeWidth: 0, fill: "#10b981" }}
              activeDot={{ r: 4, cursor: "pointer" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
