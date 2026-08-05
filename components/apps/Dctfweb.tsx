"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRL, formatCNPJ } from "@/lib/conciliacao";
import type { DctfwebResponse, DctfwebObrigada } from "@/lib/fiscal";

export default function Dctfweb({
  resp,
  fonte,
  erroServidor,
  filtros,
}: {
  resp: DctfwebResponse;
  fonte: "api" | "exemplo";
  erroServidor: string | null;
  filtros: { ano: string; mes: string; origem: string };
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [ano, setAno] = useState(filtros.ano);
  const [mes, setMes] = useState(filtros.mes);

  function aplicar(next: { ano?: string; mes?: string; origem?: string }) {
    const q = new URLSearchParams();
    const a = next.ano ?? ano;
    const m = next.mes ?? mes;
    const o = next.origem ?? filtros.origem;
    if (a) q.set("ano", a);
    if (m) q.set("mes", m);
    if (o) q.set("origem", o);
    router.push(`/m/fiscal/dctfweb${q.toString() ? `?${q}` : ""}`);
  }

  const linhas = useMemo(() => {
    const dados = resp?.dados ?? [];
    const q = busca.trim().toLowerCase();
    return dados.filter((d) => !q || (d.nome ?? "").toLowerCase().includes(q) || (d.cnpj ?? "").includes(q));
  }, [resp, busca]);

  const totalDebito = (resp?.dados ?? []).reduce((s, d) => s + (d.debito_apurado ?? 0), 0);

  return (
    <>
      {erroServidor && <div className="banner error">{erroServidor}</div>}
      {fonte === "exemplo" && !erroServidor && (
        <div className="banner">Exibindo <strong>dados de exemplo</strong>. Configure a <code>QUESTOR_API_KEY</code> para dados reais.</div>
      )}

      <div className="summary">
        <div className="card">
          <div className="k">Obrigadas {resp?.ano ? `${String(resp.mes ?? "").padStart(2, "0")}/${resp.ano}` : ""}</div>
          <div className="v num">{resp?.dados?.length ?? 0}</div>
        </div>
        <div className="card">
          <div className="k">Débito apurado (total)</div>
          <div className="v num" style={{ fontSize: 20 }}>R$ {formatBRL(totalDebito)}</div>
        </div>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Buscar empresa ou CNPJ…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <input
          className="search" style={{ minWidth: 90 }} placeholder="Ano" value={ano}
          onChange={(e) => setAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onBlur={() => aplicar({})}
          onKeyDown={(e) => e.key === "Enter" && aplicar({})}
        />
        <input
          className="search" style={{ minWidth: 70 }} placeholder="Mês" value={mes}
          onChange={(e) => setMes(e.target.value.replace(/\D/g, "").slice(0, 2))}
          onBlur={() => aplicar({})}
          onKeyDown={(e) => e.key === "Enter" && aplicar({})}
        />
        {(["", "folha", "reinf", "ambos"] as const).map((o) => (
          <span
            key={o || "todas"}
            className={`chip ${filtros.origem === o ? "on" : ""}`}
            onClick={() => aplicar({ origem: o })}
          >
            {o === "" ? "Todas origens" : o}
          </span>
        ))}
        <span className="contador">{linhas.length} de {resp?.dados?.length ?? 0}</span>
      </div>

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th className="col-empresa">Empresa</th>
              <th className="c-res">Competência</th>
              <th className="c-res">Origem</th>
              <th>Folha (INSS)</th>
              <th>Reinf</th>
              <th>Débito apurado</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((d: DctfwebObrigada) => (
              <tr key={`${d.codigoempresa}-${d.ano}-${d.mes}`}>
                <td className="col-empresa">
                  <span className="emp-nome">{d.nome ?? `Empresa ${d.codigoempresa}`}</span>
                  <span className="cnpj">
                    <span className="codigo">#{d.codigoempresa}</span>
                    {d.cnpj ? ` · ${formatCNPJ(d.cnpj)}` : ""}
                  </span>
                </td>
                <td className="c-res">{String(d.mes).padStart(2, "0")}/{d.ano}</td>
                <td className="c-res"><span className="badge badge-soft">{d.origem ?? "–"}</span></td>
                <td>{d.total_folha != null ? <span className="num">{formatBRL(d.total_folha)}</span> : <span className="dash">–</span>}</td>
                <td>{d.total_reinf != null ? <span className="num">{formatBRL(d.total_reinf)}</span> : <span className="dash">–</span>}</td>
                <td><strong>{d.debito_apurado != null ? <span className="num">{formatBRL(d.debito_apurado)}</span> : "–"}</strong></td>
              </tr>
            ))}
            {linhas.length === 0 && <tr><td className="loading" colSpan={6}>Nenhuma empresa encontrada.</td></tr>}
          </tbody>
        </table>
      </div>

      <p className="footnote">Sem ano/mês, mostra a última competência disponível. Débito apurado = folha (INSS) + EFD-Reinf.</p>
    </>
  );
}
