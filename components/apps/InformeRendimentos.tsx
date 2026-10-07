"use client";

import { useMemo, useState } from "react";
import { formatBRL } from "@/lib/conciliacao";
import type { PlanoInforme } from "@/lib/informe-rendimentos";
import type { LinhaLog } from "@/lib/informe-rendimentos-log";

interface Resultado {
  regime: "presumido" | "real";
  regimeDescricao: string | null;
  nomeEmpresa: string | null;
  plano: PlanoInforme;
  chave: string;
  gravacaoLiberada: boolean;
  motivoBloqueio: string | null;
  jaLancadoEm: string | null;
  questor: { disponivel: boolean; motivo?: string };
}

const campo: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 13 };
const entrada: React.CSSProperties = {
  border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
  borderRadius: 9, padding: "8px 10px", fontSize: 14, minWidth: 0,
};

/** Competência do mês anterior (AAAA-MM): o informe costuma ser do mês fechado. */
function mesAnterior(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const data = (iso: string) => iso.split("-").reverse().join("/");
const reais = (n: number) => `R$ ${formatBRL(n)}`;

export default function InformeRendimentos({
  empresas, logInicial, erroServidor,
}: {
  empresas: Array<{ codigo: number; nome: string }>;
  logInicial: LinhaLog[];
  erroServidor: string | null;
}) {
  const [busca, setBusca] = useState("");
  const [competencia, setCompetencia] = useState(mesAnterior());
  const [rendimento, setRendimento] = useState("");
  const [demais, setDemais] = useState("");
  const [dividendos, setDividendos] = useState("");
  const [retencao, setRetencao] = useState("");

  const [res, setRes] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [log, setLog] = useState<LinhaLog[]>(logInicial);

  // "1415 · NOME" (valor do datalist) ou só o código digitado.
  const codigo = useMemo(() => {
    const m = busca.trim().match(/^(\d{1,4})\b/);
    const n = m ? Number(m[1]) : NaN;
    return empresas.some((e) => e.codigo === n) ? n : null;
  }, [busca, empresas]);
  const nomeEscolhida = empresas.find((e) => e.codigo === codigo)?.nome ?? "";

  function corpo() {
    return { codigoempresa: codigo, competencia, rendimento, demaisReceitas: demais, dividendos, retencao };
  }

  async function chamar(url: string, body: object) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `Erro ${r.status}`);
    return j;
  }

  async function simular() {
    setErro(null); setOk(null); setRes(null);
    if (!codigo) { setErro("Escolha uma empresa da lista."); return; }
    setOcupado(true);
    try {
      setRes(await chamar("/api/contabil/informe-rendimentos/calcular", corpo()));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao simular.");
    } finally { setOcupado(false); }
  }

  async function lancar() {
    if (!res) return;
    const p = res.plano;
    if (!window.confirm(
      `Lançar no Questor?\n\nEmpresa ${p.codigoempresa} · ${res.regimeDescricao}\nCompetência ${p.competencia.split("-").reverse().join("/")}\n` +
      `${p.ecf.length} lançamento(s) na ECF e ${p.f100.length} no F100.`
    )) return;
    setErro(null); setOk(null); setOcupado(true);
    try {
      const j = await chamar("/api/contabil/informe-rendimentos/lancar", { ...corpo(), confirmar: true });
      setOk(j.repetido ? "Este lançamento já estava gravado no Questor — nada novo foi escrito." : "Informe lançado no Questor com sucesso.");
      setRes(null); setRendimento(""); setDemais(""); setDividendos(""); setRetencao("");
      const l = await fetch("/api/contabil/informe-rendimentos/log").then((r) => r.json()).catch(() => null);
      if (l?.log) setLog(l.log);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao lançar.");
    } finally { setOcupado(false); }
  }

  const money = (v: string, set: (s: string) => void, rotulo: string) => (
    <label style={campo}>
      {rotulo}
      <input style={{ ...entrada, textAlign: "right" }} inputMode="decimal" placeholder="0,00" value={v}
        onChange={(e) => { set(e.target.value.replace(/[^\d.,]/g, "")); setRes(null); }} />
    </label>
  );

  return (
    <>
      {erroServidor && <div className="banner error">{erroServidor}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", alignItems: "end" }}>
          <label style={{ ...campo, gridColumn: "span 2" }}>
            Empresa (código ou nome)
            <input style={entrada} list="informe-empresas" placeholder="Ex.: 1415" value={busca}
              onChange={(e) => { setBusca(e.target.value); setRes(null); }} />
            <datalist id="informe-empresas">
              {empresas.map((e) => <option key={e.codigo} value={`${e.codigo} · ${e.nome}`} />)}
            </datalist>
          </label>
          <label style={campo}>
            Competência
            <input style={entrada} type="month" value={competencia}
              onChange={(e) => { setCompetencia(e.target.value); setRes(null); }} />
          </label>
        </div>
        {codigo && <div style={{ fontSize: 12, color: "var(--muted, #667)", marginTop: 6 }}>{codigo} · {nomeEscolhida}</div>}

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginTop: 14 }}>
          {money(rendimento, setRendimento, "Rendimentos (receita financeira)")}
          {money(demais, setDemais, "Demais receitas")}
          {money(dividendos, setDividendos, "Dividendos")}
          {money(retencao, setRetencao, "Retenção (IRRF)")}
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn primary" disabled={ocupado || !codigo} onClick={simular}>
            {ocupado && !res ? "Consultando…" : "Simular"}
          </button>
          <span style={{ fontSize: 12, color: "var(--muted, #667)" }}>Nada é gravado até você confirmar.</span>
        </div>
      </div>

      {erro && <div className="banner error">{erro}</div>}
      {ok && <div className="banner">{ok}</div>}

      {res && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <strong>{res.nomeEmpresa ?? nomeEscolhida}</strong>
            <span className="badge badge-soft">{res.regimeDescricao}</span>
            <span style={{ fontSize: 12, color: "var(--muted, #667)" }}>regime lido do Tareffa</span>
          </div>

          {res.jaLancadoEm && (
            <div className="banner error">Este mesmo informe já foi lançado em {new Date(res.jaLancadoEm).toLocaleString("pt-BR")}.</div>
          )}
          {res.plano.avisos.map((a) => <div key={a} className="banner">{a}</div>)}
          {res.motivoBloqueio && <div className="banner error">{res.motivoBloqueio}</div>}

          <h3 style={{ fontSize: 14, margin: "8px 0" }}>ECF — OUTRAOPERACAOECF</h3>
          <div className="table-wrap" style={{ marginBottom: 14 }}>
            <table className="grid">
              <thead><tr><th style={{ textAlign: "left" }}>Lançamento</th><th>Operação</th><th>Data</th><th>Valor</th></tr></thead>
              <tbody>
                {res.plano.ecf.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center" }}>Nenhuma linha.</td></tr>}
                {res.plano.ecf.map((l, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: "left" }}>{l.rotulo}</td>
                    <td>{l.codigooperacaofis}</td><td>{data(l.datalctofis)}</td><td>{reais(l.valoroutraoperacaofis)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ fontSize: 14, margin: "8px 0" }}>PIS/COFINS — F100 (EFDF100DEMAISDOC)</h3>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Lançamento</th><th>Data</th><th>Valor</th><th>CST</th>
                  <th>PIS %</th><th>PIS</th><th>COFINS %</th><th>COFINS</th><th>Débito</th><th>Conta</th><th>Compensa</th>
                </tr>
              </thead>
              <tbody>
                {res.plano.f100.length === 0 && <tr><td colSpan={11} style={{ textAlign: "center" }}>Nenhuma linha.</td></tr>}
                {res.plano.f100.map((l, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: "left" }}>{l.rotulo}</td>
                    <td>{data(l.datalctofis)}</td><td>{reais(l.valoroper)}</td><td>{String(l.cst).padStart(2, "0")}</td>
                    <td>{formatBRL(l.aliqpis)}</td><td>{reais(l.valorpis)}</td>
                    <td>{formatBRL(l.aliqcofins)}</td><td>{reais(l.valorcofins)}</td>
                    <td>{l.tipodebito}</td><td>{l.contactb}</td><td>{l.compensacred ? "Sim" : "Não"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn primary" disabled={ocupado || !res.gravacaoLiberada || !!res.jaLancadoEm} onClick={lancar}>
              {ocupado ? "Lançando…" : "Lançar no Questor"}
            </button>
            <span style={{ fontSize: 13 }}>
              PIS {reais(res.plano.totais.pis)} · COFINS {reais(res.plano.totais.cofins)}
            </span>
          </div>
        </div>
      )}

      <h3 style={{ fontSize: 15, margin: "20px 0 8px" }}>Últimos lançamentos</h3>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Quando</th><th style={{ textAlign: "left" }}>Empresa</th><th>Comp.</th><th>Regime</th>
              <th>Rendim.</th><th>Demais</th><th>Dividendos</th><th>Retenção</th><th>PIS</th><th>COFINS</th>
              <th>Status</th><th style={{ textAlign: "left" }}>Responsável</th>
            </tr>
          </thead>
          <tbody>
            {log.length === 0 && <tr><td colSpan={12} style={{ textAlign: "center" }}>Nenhum lançamento ainda.</td></tr>}
            {log.map((l) => (
              <tr key={l.id} title={l.erro ?? undefined}>
                <td style={{ textAlign: "left" }}>{new Date(l.criado_em).toLocaleString("pt-BR")}</td>
                <td style={{ textAlign: "left" }}>{l.codigoempresa} · {l.nome_empresa ?? ""}</td>
                <td>{l.competencia.split("-").reverse().join("/")}</td>
                <td>{l.regime === "real" ? "Real" : "Presumido"}</td>
                <td>{formatBRL(l.rendimento)}</td><td>{formatBRL(l.demais_receitas)}</td>
                <td>{formatBRL(l.dividendos)}</td><td>{formatBRL(l.retencao)}</td>
                <td>{formatBRL(l.pis)}</td><td>{formatBRL(l.cofins)}</td>
                <td><span className="badge badge-soft">{l.status === "lancado" ? "Lançado" : "Erro"}</span></td>
                <td style={{ textAlign: "left" }}>{l.responsavel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
