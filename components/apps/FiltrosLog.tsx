"use client";

import type { CSSProperties } from "react";

/** Filtros do histórico (busca, competência, tipo/operação, origem e testes). */
export interface FiltroLog {
  busca: string;
  competencia: string; // AAAA-MM
  tipo: string;        // "" = todos
  origem: "" | "access" | "nucleo";
  ocultarTestes: boolean;
}

export const FILTRO_VAZIO: FiltroLog = { busca: "", competencia: "", tipo: "", origem: "", ocultarTestes: false };

export function filtroAtivo(f: FiltroLog): boolean {
  return !!(f.busca.trim() || f.competencia || f.tipo || f.origem || f.ocultarTestes);
}

export function aplicarFiltro<T extends { competencia: string; origem?: "nucleo" | "access"; teste?: boolean }>(
  linhas: T[], f: FiltroLog, textoDe: (l: T) => string, tipoDe: (l: T) => string,
): T[] {
  const q = f.busca.trim().toLowerCase();
  return linhas.filter((l) =>
    (!q || textoDe(l).toLowerCase().includes(q)) &&
    (!f.competencia || l.competencia.startsWith(f.competencia)) &&
    (!f.tipo || tipoDe(l) === f.tipo) &&
    (!f.origem || (f.origem === "access" ? l.origem === "access" : l.origem !== "access")) &&
    (!f.ocultarTestes || !l.teste),
  );
}

const campo: CSSProperties = {
  padding: "6px 8px", border: "1px solid var(--border, #cbd5e1)", borderRadius: 6,
  background: "var(--card, #fff)", color: "inherit", fontSize: 13,
};

export default function FiltrosLog({
  filtro, onChange, opcoesTipo, rotuloTipo, placeholder, total, exibidas,
}: {
  filtro: FiltroLog; onChange: (f: FiltroLog) => void;
  opcoesTipo: { valor: string; rotulo: string }[]; rotuloTipo: string;
  placeholder: string; total: number; exibidas: number;
}) {
  const set = (p: Partial<FiltroLog>) => onChange({ ...filtro, ...p });
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "0 0 10px" }}>
      <input style={{ ...campo, minWidth: 260, flex: "1 1 260px", maxWidth: 360 }} placeholder={placeholder}
        value={filtro.busca} onChange={(e) => set({ busca: e.target.value })} />
      <label style={{ fontSize: 12 }}>Competência{" "}
        <input style={campo} type="month" value={filtro.competencia} onChange={(e) => set({ competencia: e.target.value })} />
      </label>
      <label style={{ fontSize: 12 }}>{rotuloTipo}{" "}
        <select style={campo} value={filtro.tipo} onChange={(e) => set({ tipo: e.target.value })}>
          <option value="">Todos</option>
          {opcoesTipo.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </select>
      </label>
      <label style={{ fontSize: 12 }}>Origem{" "}
        <select style={campo} value={filtro.origem} onChange={(e) => set({ origem: e.target.value as FiltroLog["origem"] })}>
          <option value="">Todas</option>
          <option value="access">Access (histórico)</option>
          <option value="nucleo">Núcleo</option>
        </select>
      </label>
      <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
        <input type="checkbox" checked={filtro.ocultarTestes} onChange={(e) => set({ ocultarTestes: e.target.checked })} />
        Ocultar testes
      </label>
      {filtroAtivo(filtro) && (
        <button className="btn" onClick={() => onChange(FILTRO_VAZIO)}>Limpar filtros</button>
      )}
      <span style={{ fontSize: 12, color: "var(--muted, #667)" }}>{exibidas} de {total}</span>
    </div>
  );
}
