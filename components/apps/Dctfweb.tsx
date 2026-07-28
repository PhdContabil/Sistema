"use client";

import { useEffect, useMemo, useState } from "react";
import { formatBRL, formatCNPJ } from "@/lib/conciliacao";
import type { DctfwebResponse, DctfwebObrigada } from "@/lib/fiscal";

export default function Dctfweb() {
  const [resp, setResp] = useState<DctfwebResponse | null>(null);
  const [fonte, setFonte] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [origem, setOrigem] = useState<"" | "folha" | "reinf" | "ambos">("");
  const [ano, setAno] = useState("");
  const [mes, setMes] = useState("");

  async function carregar() {
    setCarregando(true); setErro(null);
    try {
      const q = new URLSearchParams();
      if (ano) q.set("ano", ano);
      if (mes) q.set("mes", mes);
      if (origem) q.set("origem", origem);
      const res = await fetch(`/api/fiscal/dctfweb?${q.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Falha ao carregar.");
      setResp(json); setFonte(json.fonte ?? "api");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, [origem, ano, mes]);

  const linhas = useMemo(() => {
    const dados = resp?.dados ?? [];
    const q = busca.trim().toLowerCase();
    return dados.filter((d) => !q || (d.nome ?? "").toLowerCase().includes(q) || (d.cnpj ?? "").includes(q));
  }, [resp, busca]);

  const totalDebito = (resp?.dados ?? []).reduce((s, d) => s + (d.debito_apurado ?? 0), 0);

  return (
    <>
      {fonte === "exemplo" && (<div className="banner">Exibindo <strong>dados de exemplo</strong>. Configure a <code>QUESTOR_API_KEY</code> para dados reais.</div>)}
      {erro && <div className="banner error">{erro}</div>}
      <div className="summary">
        <div className="card"><div className="k">Obrigadas {resp?.ano ? `${String(resp.mes ?? "").padStart(2, "0")}/${resp.ano}` : ""}</div><div className="v num">{resp?.dados?.length ?? 0}</div></div>
        <div className="card"><div className="k">Débito apurado (total)</div><div className="v num" style={{ fontSize: 20 }}>R$ {formatBRL(totalDebito)}</div></div>
      </div>
      <div className="toolbar">
        <input className="search" placeholder="Buscar empresa ou CNPJ…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <input className="search" style={{ minWidth: 90 }} placeholder="Ano" value={ano} onChange={(e) => setAno(e.target.value.replace(/\D/g, ""))} />
        <input className="search" style={{ minWidth: 70 }} placeholder="Mês" value={mes} onChange={(e) => setMes(e.target.value.replace(/\D/g, ""))} />
        {(["", "folha", "reinf", "ambos"] as const).map((o) => (
          <span key={o || "todas"} className={`chip ${origem === o ? "on" : ""}`} onClick={() => setOrigem(o)}>{o === "" ? "Todas origens" : o}</span>
        ))}
      </div>
      <div className="table-wrap">
        {carregando ? (<div className="loading">Carregando DCTFWeb…</div>) : (
          <table className="grid">
            <thead>
              <tr>
                <th className="col-empresa">Empresa</th>
                <th>Competência</th>
                <th>Origem</th>
                <th>Folha (INSS)</th>
                <th>Reinf</th>
                <th>Débito apurado</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((d: DctfwebObrigada) => (
                <tr key={`${d.codigoempresa}-${d.ano}-${d.mes}`}>
                  <td className="col-empresa">{d.nome ?? `Empresa ${d.codigoempresa}`}<span className="cnpj"><span className="codigo">#{d.codigoempresa}</span>{d.cnpj ? ` · ${formatCNPJ(d.cnpj)}` : ""}</span></td>
                  <td style={{ textAlign: "center" }}>{String(d.mes).padStart(2, "0")}/{d.ano}</td>
                  <td style={{ textAlign: "center" }}><span className="badge badge-soft">{d.origem ?? "–"}</span></td>
                  <td>{d.total_folha != null ? <span className="num">{formatBRL(d.total_folha)}</span> : <span className="dash">–</span>}</td>
                  <td>{d.total_reinf != null ? <span className="num">{formatBRL(d.total_reinf)}</span> : <span className="dash">–</span>}</td>
                  <td><strong>{d.debito_apurado != null ? <span className="num">{formatBRL(d.debito_apurado)}</span> : "–"}</strong></td>
                </tr>
              ))}
              {linhas.length === 0 && <tr><td className="loading" colSpan={6}>Nenhuma empresa encontrada.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <p className="footnote">Sem ano/mês, mostra a última competência disponível. Débito apurado = folha (INSS) + EFD-Reinf.</p>
    </>
  );
}
