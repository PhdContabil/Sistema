"use client";

import { useEffect, useMemo, useState } from "react";
import { formatBRL, formatCNPJ } from "@/lib/conciliacao";
import { situacaoLimite, situacaoClass, ordemSituacao, formatPct, MESES_ABREV, type AnaliseLimiteResponse, type EmpresaLimite, type Situacao } from "@/lib/fiscal";

function MiniChart({ e, sublimite, limite }: { e: EmpresaLimite; sublimite: number; limite: number }) {
  const W = 520, H = 150, padL = 8, padR = 8, padT = 10, padB = 20;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const maxV = Math.max(limite * 1.05, ...e.mensal.map((m) => m.acumulado));
  const y = (v: number) => padT + innerH - (v / maxV) * innerH;
  const barW = innerW / 12;
  function cor(v: number) {
    if (v > limite) return "#dc2626";
    if (v > sublimite) return "#f59e0b";
    return "#16a34a";
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }}>
      <line x1={padL} x2={W - padR} y1={y(sublimite)} y2={y(sublimite)} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1} />
      <line x1={padL} x2={W - padR} y1={y(limite)} y2={y(limite)} stroke="#dc2626" strokeDasharray="4 3" strokeWidth={1} />
      <text x={W - padR} y={y(sublimite) - 3} textAnchor="end" fontSize="9" fill="#b45309">sublimite 3,6 mi</text>
      <text x={W - padR} y={y(limite) - 3} textAnchor="end" fontSize="9" fill="#b91c1c">limite 4,8 mi</text>
      {e.mensal.map((m, i) => {
        const bx = padL + i * barW + 2;
        const by = y(m.acumulado);
        const bh = padT + innerH - by;
        return (
          <g key={m.mes}>
            <rect x={bx} y={by} width={barW - 4} height={Math.max(bh, 0)} fill={cor(m.acumulado)} opacity={m.projetado ? 0.4 : 0.9} rx={2}>
              <title>{`${MESES_ABREV[i]}: acumulado ${formatBRL(m.acumulado)}${m.projetado ? " (projetado)" : ""}`}</title>
            </rect>
            <text x={bx + (barW - 4) / 2} y={H - 6} textAnchor="middle" fontSize="8" fill="#8a929e">{MESES_ABREV[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Row({ e, sit, sublimite, limite, aberta, onToggle }: { e: EmpresaLimite; sit: Situacao; sublimite: number; limite: number; aberta: boolean; onToggle: () => void; }) {
  const mesEstouro = e.mes_estouro_limite ?? e.mes_estouro_sublimite ?? null;
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer" }}>
        <td className="col-empresa">{e.nome ?? `Empresa ${e.codigoempresa}`}{e.cnpj && <span className="cnpj">{formatCNPJ(e.cnpj)}</span>}</td>
        <td className="num">{formatBRL(e.faturamento_ano)}</td>
        <td className="num">{e.meses_com_faturamento}</td>
        <td className="num">{formatBRL(e.media_mensal)}</td>
        <td className="num"><strong>{formatBRL(e.projecao_anual)}</strong></td>
        <td className="num">{formatPct(e.percentual_sublimite)}</td>
        <td className="num">{formatPct(e.percentual_limite)}</td>
        <td style={{ textAlign: "center" }}><span className={`badge ${situacaoClass(sit)}`}>{sit}</span></td>
        <td style={{ textAlign: "center" }}>{mesEstouro ?? <span className="dash">–</span>}</td>
        <td style={{ textAlign: "center", color: "var(--muted)" }}>{aberta ? "▾" : "▸"}</td>
      </tr>
      {aberta && (
        <tr className="detail-row">
          <td colSpan={10}>
            <div className="detail-box">
              <div className="detail-title">Acumulado mês a mês — {e.ano}</div>
              <MiniChart e={e} sublimite={sublimite} limite={limite} />
              <div className="detail-note">Barras claras = meses projetados pela média. Verde abaixo do sublimite, laranja entre sublimite e limite, vermelho acima do limite.</div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function LimiteSimples() {
  const [resp, setResp] = useState<AnaliseLimiteResponse | null>(null);
  const [fonte, setFonte] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Situacao | "todos">("todos");
  const [aberta, setAberta] = useState<number | null>(null);

  async function carregar() {
    setCarregando(true); setErro(null);
    try {
      const res = await fetch("/api/fiscal/limite", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Falha ao carregar.");
      setResp(json); setFonte(json.fonte ?? "api");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  const linhas = useMemo(() => {
    const dados = resp?.dados ?? [];
    const q = busca.trim().toLowerCase();
    return dados.map((e) => ({ e, sit: situacaoLimite(e) })).filter(({ e, sit }) => {
      if (filtro !== "todos" && sit !== filtro) return false;
      if (!q) return true;
      return (e.nome ?? "").toLowerCase().includes(q) || (e.cnpj ?? "").includes(q);
    }).sort((a, b) => ordemSituacao(a.sit) - ordemSituacao(b.sit) || b.e.projecao_anual - a.e.projecao_anual);
  }, [resp, busca, filtro]);

  const dados = resp?.dados ?? [];
  const nSub = dados.filter((e) => e.estoura_sublimite).length;
  const nLim = dados.filter((e) => e.estoura_limite).length;

  return (
    <>
      {fonte === "exemplo" && (<div className="banner">Exibindo <strong>dados de exemplo</strong>. Configure a <code>QUESTOR_API_KEY</code> para dados reais.</div>)}
      {erro && <div className="banner error">{erro}</div>}
      <div className="summary">
        <div className="card"><div className="k">Empresas ({resp?.ano ?? ""})</div><div className="v num">{dados.length}</div></div>
        <div className="card"><div className="k">Estouram sublimite</div><div className="v num" style={{ color: "#f59e0b" }}>{nSub}</div></div>
        <div className="card"><div className="k">Estouram limite</div><div className="v num" style={{ color: "var(--div)" }}>{nLim}</div></div>
      </div>
      <div className="toolbar">
        <input className="search" placeholder="Buscar empresa ou CNPJ…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {(["todos", "Crítico", "Atenção", "Observar", "OK"] as const).map((f) => (
          <span key={f} className={`chip ${filtro === f ? "on" : ""}`} onClick={() => setFiltro(f)}>{f === "todos" ? "Todos" : f}</span>
        ))}
        <button className="btn" onClick={carregar} disabled={carregando}>{carregando ? "…" : "↻"}</button>
      </div>
      <div className="table-wrap">
        {carregando ? (<div className="loading">Carregando análise de limite…</div>) : (
          <table className="grid">
            <thead>
              <tr>
                <th className="col-empresa">Empresa</th>
                <th>Faturam. ano</th>
                <th>Meses</th>
                <th>Média/mês</th>
                <th>Projeção anual</th>
                <th>% sublimite</th>
                <th>% limite</th>
                <th>Situação</th>
                <th>Mês estouro</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ e, sit }) => (
                <Row key={e.codigoempresa} e={e} sit={sit} sublimite={resp!.sublimite} limite={resp!.limite_geral} aberta={aberta === e.codigoempresa} onToggle={() => setAberta(aberta === e.codigoempresa ? null : e.codigoempresa)} />
              ))}
              {linhas.length === 0 && <tr><td className="loading" colSpan={10}>Nenhuma empresa encontrada.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <p className="footnote">Projeção pela média mensal do ano. Sublimite R$ 3.600.000 (ICMS/ISS) e limite geral R$ 4.800.000 (Simples). Clique em uma linha para ver o acumulado mês a mês.</p>
    </>
  );
}
