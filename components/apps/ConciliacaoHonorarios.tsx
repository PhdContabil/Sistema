"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { avaliar, formatBRL, formatNum, formatCNPJ, type ConciliacaoItem } from "@/lib/conciliacao";

type Filtro = "todos" | "ok" | "divergente" | "sem";

function money(v: number) {
  return v > 0 ? <span className="num">{formatBRL(v)}</span> : <span className="dash">–</span>;
}
function resClass(r: string) {
  if (r === "OK") return "res-ok";
  if (r === "Divergente") return "res-div";
  return "res-neutro";
}

export default function ConciliacaoHonorarios({
  dados,
  fonte,
  erroServidor,
}: {
  dados: ConciliacaoItem[];
  fonte: "api" | "exemplo";
  erroServidor: string | null;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [atualizando, setAtualizando] = useState(false);

  const linhas = useMemo(() => dados.map(avaliar), [dados]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (filtro === "ok" && l.resultado !== "OK") return false;
      if (filtro === "divergente" && l.resultado !== "Divergente") return false;
      if (filtro === "sem" && l.resultado !== "Sem contrato") return false;
      if (!q) return true;
      return (
        (l.nome ?? "").toLowerCase().includes(q) ||
        (l.cnpj ?? "").includes(q) ||
        String(l.codigoempresa).includes(q)
      );
    });
  }, [linhas, busca, filtro]);

  const totalOk = linhas.filter((l) => l.resultado === "OK").length;
  const totalDiv = linhas.filter((l) => l.resultado === "Divergente").length;
  const totalSem = linhas.filter((l) => l.resultado === "Sem contrato").length;

  function atualizar() {
    setAtualizando(true);
    router.refresh();
    setTimeout(() => setAtualizando(false), 1200);
  }

  return (
    <>
      {erroServidor && <div className="banner error">{erroServidor}</div>}
      {fonte === "exemplo" && !erroServidor && (
        <div className="banner">
          Exibindo <strong>dados de exemplo</strong>. Configure a <code>QUESTOR_API_KEY</code> no servidor para as empresas reais.
        </div>
      )}

      <div className="summary">
        <div className="card"><div className="k">Empresas</div><div className="v num">{linhas.length}</div></div>
        <div className="card ok"><div className="k">OK</div><div className="v num">{totalOk}</div></div>
        <div className="card div"><div className="k">Divergentes</div><div className="v num">{totalDiv}</div></div>
        <div className="card"><div className="k">Sem contrato</div><div className="v num" style={{ color: "var(--muted)" }}>{totalSem}</div></div>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Buscar empresa, CNPJ ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <span className={`chip ${filtro === "todos" ? "on" : ""}`} onClick={() => setFiltro("todos")}>Todos</span>
        <span className={`chip ${filtro === "ok" ? "on" : ""}`} onClick={() => setFiltro("ok")}>OK</span>
        <span className={`chip ${filtro === "divergente" ? "on" : ""}`} onClick={() => setFiltro("divergente")}>Divergentes</span>
        <span className={`chip ${filtro === "sem" ? "on" : ""}`} onClick={() => setFiltro("sem")}>Sem contrato</span>
        <button className="btn primary" onClick={atualizar} disabled={atualizando}>
          {atualizando ? "Atualizando…" : "↻ Atualizar"}
        </button>
        <span className="contador">{filtradas.length} de {linhas.length}</span>
      </div>

      <div className="legend">
        <span className="lg"><span className="sw sw-hon" />Honorários contratados (R$)</span>
        <span className="lg"><span className="sw sw-mov" />Movimento dos setores</span>
      </div>

      <div className="table-wrap">
        <table className="grid conc">
          <thead>
            <tr>
              <th className="col-empresa">Empresa</th>
              <th className="hon">DP</th>
              <th className="hon">Fiscal</th>
              <th className="hon">Contábil</th>
              <th className="hon">Manut.</th>
              <th className="hon">Total</th>
              <th className="mov">Empreg.</th>
              <th className="mov">Pró-lab.</th>
              <th className="mov">Faturam./mês</th>
              <th className="mov">Lançtos 6m</th>
              <th className="c-res">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((l) => (
              <tr key={l.codigoempresa}>
                <td className="col-empresa">
                  <span className="emp-nome">{l.nome ?? `Empresa ${l.codigoempresa}`}</span>
                  <span className="cnpj">
                    <span className="codigo">#{l.codigoempresa}</span>
                    {l.cnpj ? ` · ${formatCNPJ(l.cnpj)}` : ""}
                  </span>
                  {l.consideracoes && (
                    <span className={`obs ${l.resultado === "Divergente" ? "obs-div" : ""}`}>{l.consideracoes}</span>
                  )}
                </td>
                <td className="hon">{money(l.financeiro.dp)}</td>
                <td className="hon">{money(l.financeiro.fiscal)}</td>
                <td className="hon">{money(l.financeiro.contabil)}</td>
                <td className="hon">{money(l.financeiro.manutencao)}</td>
                <td className="hon"><strong>{money(l.financeiro.total)}</strong></td>
                <td className="mov num">{formatNum(l.setores.empregados)}</td>
                <td className="mov num">{formatNum(l.setores.prolabore)}</td>
                <td className="mov">{money(l.setores.faturamento_mensal)}</td>
                <td className="mov num">{formatNum(l.setores.lancamentos_media6m)}</td>
                <td className={`c-res ${resClass(l.resultado)}`}>{l.resultado}</td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr><td className="loading" colSpan={11}>Nenhuma empresa encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="footnote">
        Regra: o setor &quot;faz&quot; o serviço quando o movimento correspondente é maior que zero.
        Divergência quando há honorário sem movimento, ou movimento sem honorário. O motivo aparece
        abaixo do nome da empresa. Faturamento e lançamentos são a média dos últimos 6 meses.
      </p>
    </>
  );
}
