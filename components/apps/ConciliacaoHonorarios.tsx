"use client";

import { useEffect, useMemo, useState } from "react";
import { avaliar, formatBRL, formatNum, formatCNPJ, type ConciliacaoItem, type LinhaConciliacao } from "@/lib/conciliacao";

type Filtro = "todos" | "ok" | "divergente";
interface ApiResp { dados?: ConciliacaoItem[]; fonte?: "api" | "exemplo"; error?: string; }

function money(v: number) {
  return v > 0 ? <span className="num">{formatBRL(v)}</span> : <span className="dash">–</span>;
}

export default function ConciliacaoHonorarios() {
  const [linhas, setLinhas] = useState<LinhaConciliacao[]>([]);
  const [fonte, setFonte] = useState<"api" | "exemplo" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");

  async function carregar() {
    setCarregando(true); setErro(null);
    try {
      const res = await fetch("/api/conciliacao", { cache: "no-store" });
      const json: ApiResp = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Falha ao carregar dados.");
      setLinhas((json.dados ?? []).map(avaliar));
      setFonte(json.fonte ?? "api");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido."); setLinhas([]);
    } finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (filtro === "ok" && l.resultado !== "OK") return false;
      if (filtro === "divergente" && l.resultado !== "Divergente") return false;
      if (!q) return true;
      return (l.nome ?? "").toLowerCase().includes(q) || (l.cnpj ?? "").includes(q) || String(l.codigoempresa).includes(q);
    });
  }, [linhas, busca, filtro]);

  const totalOk = linhas.filter((l) => l.resultado === "OK").length;
  const totalDiv = linhas.filter((l) => l.resultado === "Divergente").length;

  return (
    <>
      {fonte === "exemplo" && (
        <div className="banner">Exibindo <strong>dados de exemplo</strong>. Configure a <code>QUESTOR_API_KEY</code> no servidor para carregar as empresas reais.</div>
      )}
      {erro && <div className="banner error">{erro}</div>}

      <div className="summary">
        <div className="card"><div className="k">Empresas</div><div className="v num">{linhas.length}</div></div>
        <div className="card ok"><div className="k">OK</div><div className="v num">{totalOk}</div></div>
        <div className="card div"><div className="k">Divergentes</div><div className="v num">{totalDiv}</div></div>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Buscar empresa, CNPJ ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <span className={`chip ${filtro === "todos" ? "on" : ""}`} onClick={() => setFiltro("todos")}>Todos</span>
        <span className={`chip ${filtro === "ok" ? "on" : ""}`} onClick={() => setFiltro("ok")}>OK</span>
        <span className={`chip ${filtro === "divergente" ? "on" : ""}`} onClick={() => setFiltro("divergente")}>Divergentes</span>
        <button className="btn primary" onClick={carregar} disabled={carregando}>{carregando ? "Atualizando…" : "↻ Atualizar"}</button>
      </div>

      <div className="table-wrap">
        {carregando ? (
          <div className="loading">Carregando conciliação…</div>
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th className="col-empresa" rowSpan={3}>Empresa</th>
                <th className="grp-fin" colSpan={5}>Financeiro (honorários)</th>
                <th className="grp-set" colSpan={4}>Setores (movimento)</th>
                <th className="grp-res" rowSpan={3}>Resultado</th>
                <th className="grp-res" rowSpan={3}>Considerações</th>
              </tr>
              <tr>
                <th className="sub-fin" rowSpan={2}>DP</th>
                <th className="sub-fin" rowSpan={2}>Fiscal</th>
                <th className="sub-fin" rowSpan={2}>Contábil</th>
                <th className="sub-fin" rowSpan={2}>Manut.</th>
                <th className="sub-fin" rowSpan={2}>Total</th>
                <th className="sub-set" colSpan={2}>DP</th>
                <th className="sub-set" rowSpan={2}>Fiscal<br />fatur/mês</th>
                <th className="sub-set" rowSpan={2}>Contábil<br />lançtos 6m</th>
              </tr>
              <tr>
                <th className="sub-set">Empreg</th>
                <th className="sub-set">Pró-lab</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l) => (
                <tr key={l.codigoempresa}>
                  <td className="col-empresa">{l.nome ?? `Empresa ${l.codigoempresa}`}<span className="cnpj"><span className="codigo">#{l.codigoempresa}</span>{l.cnpj ? ` · ${formatCNPJ(l.cnpj)}` : ""}</span></td>
                  <td>{money(l.financeiro.dp)}</td>
                  <td>{money(l.financeiro.fiscal)}</td>
                  <td>{money(l.financeiro.contabil)}</td>
                  <td>{money(l.financeiro.manutencao)}</td>
                  <td><strong>{money(l.financeiro.total)}</strong></td>
                  <td className="num">{formatNum(l.setores.empregados)}</td>
                  <td className="num">{formatNum(l.setores.prolabore)}</td>
                  <td>{money(l.setores.faturamento_mensal)}</td>
                  <td className="num">{formatNum(l.setores.lancamentos_media6m)}</td>
                  <td className={l.resultado === "OK" ? "res-ok" : "res-div"}>{l.resultado}</td>
                  <td className="consid">{l.consideracoes || <span className="dash">–</span>}</td>
                </tr>
              ))}
              {filtradas.length === 0 && (<tr><td className="loading" colSpan={12}>Nenhuma empresa encontrada.</td></tr>)}
            </tbody>
          </table>
        )}
      </div>

      <p className="footnote">Regra: o setor &quot;faz&quot; o serviço quando o movimento correspondente é maior que zero. Divergência quando há honorário sem movimento, ou movimento sem honorário. Faturamento e lançamentos são a média dos últimos 6 meses.</p>
    </>
  );
}
