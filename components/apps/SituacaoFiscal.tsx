"use client";

// Fiscal · Situação Fiscal. Abrir a tela NÃO consulta a Receita: só lê o
// banco e a carteira do Questor. Toda consulta SITFIS é paga e acontece por
// clique — uma empresa por requisição, num laço com progresso e botão parar.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCNPJ } from "@/lib/conciliacao";

type Situacao = "regular" | "com_restricao" | "irregular" | "indefinida" | "erro";

interface Linha {
  cnpj: string;
  razao_social: string | null;
  codigoempresa: number | null;
  ativa_questor: boolean;
  situacao: Situacao | null;
  pendencias: number | null;
  resumo: string | null;
  mensagem: string | null;
  consultado_em: string | null;
  simples_opcao: boolean | null;
  simples_inclusao: string | null;
  simples_exclusao: string | null;
  simei_opcao: boolean | null;
  certidao_tipo: string | null;
  certidao_validade: string | null;
  tem_pdf: boolean;
}

const ROTULO: Record<Situacao | "nunca", string> = {
  regular: "Regular",
  com_restricao: "Com restrição",
  irregular: "Irregular",
  indefinida: "Indefinida",
  erro: "Erro",
  nunca: "Não consultada",
};
const COR: Record<Situacao | "nunca", string> = {
  regular: "var(--ok)", com_restricao: "#b45309", irregular: "var(--div)",
  indefinida: "var(--muted)", erro: "var(--div)", nunca: "var(--muted)",
};

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hoje = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD local
const dataBR = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};
const chave = (l: Linha): Situacao | "nunca" => l.situacao ?? "nunca";

/** Simples: optante / saída agendada (exclusão futura) / excluído. */
function simplesTexto(l: Linha): string {
  if (l.simei_opcao) return "MEI";
  if (l.simples_opcao == null) return "—";
  if (l.simples_opcao && l.simples_exclusao) return `Sai em ${dataBR(l.simples_exclusao)}`;
  if (l.simples_opcao) return "Optante";
  return l.simples_exclusao ? `Excluída ${dataBR(l.simples_exclusao)}` : "Não optante";
}

export default function SituacaoFiscal() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [busca, setBusca] = useState("");
  const [filtroSit, setFiltroSit] = useState<"" | Situacao | "nunca">("");
  const [filtroSimples, setFiltroSimples] = useState<"" | "optante" | "saindo" | "mei" | "nao">("");
  const [soAtivas, setSoAtivas] = useState(true);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const [lote, setLote] = useState<{ feitos: number; total: number; falhas: number; atual: string } | null>(null);
  const parar = useRef(false);
  const [pularHoje, setPularHoje] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/fiscal/situacao-fiscal", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falha ao carregar.");
      setLinhas(j.linhas);
      setAviso(j.avisoCarteira);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Sem a carteira do Questor ninguém é "ativa": o filtro só vale quando ela carregou.
  const temCarteira = useMemo(() => linhas.some((l) => l.ativa_questor), [linhas]);
  const filtrarAtivas = soAtivas && temCarteira;

  const filtrados = useMemo(() => {
    const q = semAcento(busca.trim());
    const qDig = busca.replace(/\D/g, "");
    return linhas.filter((l) => {
      if (filtrarAtivas && !l.ativa_questor) return false;
      if (filtroSit && chave(l) !== filtroSit) return false;
      if (filtroSimples === "mei" && !l.simei_opcao) return false;
      if (filtroSimples === "optante" && !(l.simples_opcao && !l.simei_opcao)) return false;
      if (filtroSimples === "saindo" && !(l.simples_opcao && l.simples_exclusao)) return false;
      if (filtroSimples === "nao" && l.simples_opcao !== false) return false;
      if (!q) return true;
      return semAcento(l.razao_social ?? "").includes(q)
        || (qDig.length >= 3 && l.cnpj.includes(qDig))
        || String(l.codigoempresa ?? "") === busca.trim();
    });
  }, [linhas, busca, filtroSit, filtroSimples, filtrarAtivas]);

  const kpis = useMemo(() => {
    const base = linhas.filter((l) => !filtrarAtivas || l.ativa_questor);
    const c = (k: Situacao | "nunca") => base.filter((l) => chave(l) === k).length;
    return {
      total: base.length,
      regular: c("regular"), com_restricao: c("com_restricao"), irregular: c("irregular"),
      nunca: c("nunca"), problema: c("erro") + c("indefinida"),
    };
  }, [linhas, filtrarAtivas]);

  function alternar(cnpj: string) {
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(cnpj)) n.delete(cnpj); else n.add(cnpj);
      return n;
    });
  }
  const todosMarcados = filtrados.length > 0 && filtrados.every((l) => selecionados.has(l.cnpj));
  function marcarTodos() {
    setSelecionados(todosMarcados ? new Set() : new Set(filtrados.map((l) => l.cnpj)));
  }

  /** Laço no navegador: uma empresa por requisição. Resposta não-JSON (timeout) conta como falha, não quebra o lote. */
  async function consultar(alvos: Linha[]) {
    const fila = pularHoje ? alvos.filter((l) => (l.consultado_em ?? "").slice(0, 10) !== hoje()) : alvos;
    if (!fila.length) { setMsg("Todas as selecionadas já foram consultadas hoje."); return; }
    if (!confirm(`Consultar ${fila.length} empresa(s) na Receita?\n\nCada consulta é cobrada pelo SERPRO e gera um relatório novo.`)) return;

    parar.current = false;
    setMsg(null);
    let falhas = 0;
    const erros: string[] = [];
    for (let i = 0; i < fila.length; i++) {
      if (parar.current) break;
      const l = fila[i];
      setLote({ feitos: i, total: fila.length, falhas, atual: l.razao_social ?? formatCNPJ(l.cnpj) });
      try {
        const r = await fetch("/api/fiscal/situacao-fiscal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "consultar", cnpj: l.cnpj, razao_social: l.razao_social }),
        });
        const j = await r.json().catch(() => ({ error: `Resposta inválida (HTTP ${r.status}).` }));
        if (!r.ok || !j.ok) { falhas++; erros.push(`${l.razao_social ?? l.cnpj}: ${j.error ?? j.mensagem ?? "falhou"}`); }
      } catch (e) {
        falhas++;
        erros.push(`${l.razao_social ?? l.cnpj}: ${e instanceof Error ? e.message : "falha de rede"}`);
      }
    }
    const feitos = parar.current ? "Interrompido" : "Concluído";
    setLote(null);
    setMsg(`${feitos}: ${fila.length - falhas} ok, ${falhas} com falha.${erros.length ? "\n" + erros.slice(0, 8).join("\n") : ""}`);
    setSelecionados(new Set());
    carregar();
  }

  async function reclassificar() {
    setMsg("Reclassificando…");
    let total = 0, mudaram = 0;
    for (let volta = 0; volta < 100; volta++) {
      const r = await fetch("/api/fiscal/situacao-fiscal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "reclassificar" }),
      });
      const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      if (!r.ok) { setMsg(`Falha ao reclassificar: ${j.error}`); return; }
      total += j.processadas; mudaram += j.mudaram;
      setMsg(`Reclassificando… ${total} processadas, faltam ${j.restantes}.`);
      if (!j.restantes || !j.processadas) break;
    }
    setMsg(`Reclassificação concluída (regra atual): ${total} relatórios, ${mudaram} mudaram de situação.`);
    carregar();
  }

  function baixarCsv() {
    const cab = ["Código", "Razão social", "CNPJ", "Situação", "Pendências", "Resumo", "Simples", "Certidão", "Validade certidão", "Consultado em"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const corpo = filtrados.map((l) => [
      l.codigoempresa, l.razao_social, formatCNPJ(l.cnpj), ROTULO[chave(l)], l.pendencias, l.resumo,
      simplesTexto(l), l.certidao_tipo, dataBR(l.certidao_validade), dataBR(l.consultado_em),
    ].map(esc).join(";"));
    const blob = new Blob(["﻿" + [cab.map(esc).join(";"), ...corpo].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `situacao-fiscal_${hoje()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const kpi = (k: Situacao | "nunca" | "", rotulo: string, v: number, desc: string, cls = "") => (
    <div className={`card ${cls}`} style={{ cursor: "pointer", outline: filtroSit === k && k ? "2px solid var(--accent)" : undefined }}
         onClick={() => setFiltroSit(filtroSit === k ? "" : k)}>
      <div className="k">{rotulo}</div>
      <div className="v num">{v}</div>
      <div className="desc">{desc}</div>
    </div>
  );

  const selecionadasLinhas = filtrados.filter((l) => selecionados.has(l.cnpj));

  return (
    <>
      {erro && <div className="banner error"><strong>Erro:</strong> {erro}</div>}
      {aviso && <div className="banner error">{aviso}</div>}

      <div className="summary">
        {kpi("", "Empresas", kpis.total, filtrarAtivas ? "ativas no Questor" : "já consultadas")}
        {kpi("regular", "Regulares", kpis.regular, "sem pendências", "ok")}
        {kpi("com_restricao", "Com restrição", kpis.com_restricao, "exigibilidade suspensa")}
        {kpi("irregular", "Irregulares", kpis.irregular, "débito exigível", kpis.irregular ? "div" : "")}
        {kpi("nunca", "Não consultadas", kpis.nunca, "sem relatório")}
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Buscar razão social, CNPJ ou código…"
               value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="search" style={{ minWidth: 0 }} value={filtroSit}
                onChange={(e) => setFiltroSit(e.target.value as typeof filtroSit)}>
          <option value="">Todas as situações</option>
          {(Object.keys(ROTULO) as (Situacao | "nunca")[]).map((k) => <option key={k} value={k}>{ROTULO[k]}</option>)}
        </select>
        <select className="search" style={{ minWidth: 0 }} value={filtroSimples}
                onChange={(e) => setFiltroSimples(e.target.value as typeof filtroSimples)}>
          <option value="">Simples: todos</option>
          <option value="optante">Optante do Simples</option>
          <option value="saindo">Saída agendada</option>
          <option value="mei">MEI (SIMEI)</option>
          <option value="nao">Não optante</option>
        </select>
        {temCarteira && (
          <span className={`chip ${soAtivas ? "on" : ""}`} onClick={() => setSoAtivas((v) => !v)}>Só carteira ativa</span>
        )}
        <button className="btn" onClick={carregar} disabled={carregando || !!lote}>Recarregar</button>
        <button className="btn" onClick={baixarCsv}>↓ CSV</button>
        <button className="btn" onClick={reclassificar} disabled={!!lote}
                title="Reaplica a regra de classificação nos relatórios já salvos. Não consulta a Receita (sem custo).">
          Reclassificar
        </button>
        <span className="contador">{filtrados.length} de {linhas.length}</span>
      </div>

      <div className="toolbar">
        {lote ? (
          <>
            <strong>Consultando {lote.feitos + 1} de {lote.total}</strong>
            <span className="desc">{lote.atual} · {lote.falhas} falha(s)</span>
            <button className="btn" onClick={() => { parar.current = true; }}>■ Parar</button>
          </>
        ) : (
          <>
            <button className="btn primary" disabled={!selecionadasLinhas.length}
                    onClick={() => consultar(selecionadasLinhas)}>
              Consultar na Receita ({selecionadasLinhas.length})
            </button>
            <label className="desc" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={pularHoje} onChange={(e) => setPularHoje(e.target.checked)} />
              pular quem já foi consultado hoje
            </label>
            <span className="desc">Cada consulta é cobrada pelo SERPRO.</span>
          </>
        )}
      </div>
      {msg && <div className="banner" style={{ whiteSpace: "pre-line" }}>{msg}</div>}

      <div className="table-wrap fixa">
        <table className="grid">
          <thead>
            <tr>
              <th><input type="checkbox" checked={todosMarcados} onChange={marcarTodos} disabled={!!lote} /></th>
              <th className="col-empresa">Empresa</th>
              <th>CNPJ</th>
              <th>Situação</th>
              <th>Resumo</th>
              <th>Simples</th>
              <th>Certidão</th>
              <th>Consultado</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td className="loading" colSpan={9}>Carregando…</td></tr>}
            {!carregando && filtrados.length === 0 && (
              <tr><td className="loading" colSpan={9}>Nenhuma empresa com esses filtros.</td></tr>
            )}
            {!carregando && filtrados.map((l) => {
              const k = chave(l);
              return (
                <tr key={l.cnpj}>
                  <td><input type="checkbox" checked={selecionados.has(l.cnpj)} onChange={() => alternar(l.cnpj)} disabled={!!lote} /></td>
                  <td className="col-empresa">
                    <span className="emp-nome">{l.razao_social ?? "—"}</span>
                    <span className="cnpj">
                      {l.codigoempresa != null && <span className="codigo">emp. {l.codigoempresa}</span>}
                      {temCarteira && !l.ativa_questor && <span className="tag-inativa"> fora da carteira</span>}
                    </span>
                  </td>
                  <td>{formatCNPJ(l.cnpj)}</td>
                  <td>
                    <span className="badge" style={{ color: COR[k], background: `color-mix(in srgb, ${COR[k]} 14%, transparent)` }}>
                      {ROTULO[k]}
                    </span>
                  </td>
                  <td className="desc" style={{ maxWidth: 380 }} title={l.mensagem ?? undefined}>
                    {l.situacao === "erro" ? l.mensagem : l.resumo ?? "—"}
                  </td>
                  <td>{simplesTexto(l)}</td>
                  <td>{l.certidao_tipo ? `${l.certidao_tipo} · ${dataBR(l.certidao_validade)}` : "—"}</td>
                  <td>{dataBR(l.consultado_em)}</td>
                  <td>
                    {l.tem_pdf
                      ? <a href={`/api/fiscal/situacao-fiscal/pdf?cnpj=${l.cnpj}`} target="_blank" rel="noreferrer">Abrir</a>
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
