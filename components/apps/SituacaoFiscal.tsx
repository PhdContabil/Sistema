"use client";

// Fiscal · Situação Fiscal. Abrir a tela NÃO consulta a Receita: só lê o
// banco e a carteira do Questor. Toda consulta SITFIS é paga e acontece por
// clique — uma empresa por requisição, num laço com progresso e botão parar.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { formatCNPJ } from "@/lib/conciliacao";
import s from "./SituacaoFiscal.module.css";

type Situacao = "regular" | "com_restricao" | "irregular" | "indefinida" | "erro";
type Chave = Situacao | "nunca";

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

const ROTULO: Record<Chave, string> = {
  regular: "Regular",
  com_restricao: "Com restrição",
  irregular: "Irregular",
  indefinida: "Indefinida",
  erro: "Erro na consulta",
  nunca: "Não consultada",
};
const TOM: Record<Chave, string> = {
  regular: "#16a34a", com_restricao: "#d97706", irregular: "#dc2626",
  indefinida: "#64748b", erro: "#9333ea", nunca: "#64748b",
};

const POR_PAGINA = 50;

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hoje = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD local
const dataBR = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};
const chave = (l: Linha): Chave => l.situacao ?? "nunca";
const tom = (cor: string) => ({ "--tom": cor }) as CSSProperties;

function haQuanto(iso: string | null): string {
  if (!iso) return "";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 31) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
}

function iniciais(nome: string | null): string {
  const p = (nome ?? "").replace(/^[\d.\s]+/, "").split(/\s+/).filter((x) => x.length > 1);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "—";
}

/** Simples: optante / saída agendada (exclusão futura) / excluído. */
function simples(l: Linha): { texto: string; cor: string | null } {
  if (l.simei_opcao) return { texto: "MEI", cor: "#0891b2" };
  if (l.simples_opcao == null) return { texto: "—", cor: null };
  if (l.simples_opcao && l.simples_exclusao) return { texto: `Sai em ${dataBR(l.simples_exclusao)}`, cor: "#d97706" };
  if (l.simples_opcao) return { texto: "Optante", cor: "#2563eb" };
  return { texto: l.simples_exclusao ? `Excluída em ${dataBR(l.simples_exclusao)}` : "Não optante", cor: null };
}

// Ícones (traço, herdam a cor do botão)
const Ico = {
  busca: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  olho: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>,
  pdf: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>,
  consultar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>,
  csv: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" /></svg>,
  regra: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M4 12h10M4 17h6" /><path d="m17 15 2 2 3-4" /></svg>,
  moeda: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1.1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5v11" /></svg>,
};

export default function SituacaoFiscal() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [busca, setBusca] = useState("");
  const [filtroSit, setFiltroSit] = useState<"" | Chave>("");
  const [filtroSimples, setFiltroSimples] = useState<"" | "optante" | "saindo" | "mei" | "nao">("");
  const [soAtivas, setSoAtivas] = useState(true);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [pagina, setPagina] = useState(0);
  const [detalhe, setDetalhe] = useState<Linha | null>(null);

  const [lote, setLote] = useState<{ feitos: number; total: number; falhas: number; atual: string } | null>(null);
  const parar = useRef(false);
  const [pularHoje, setPularHoje] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [reclassificando, setReclassificando] = useState(false);

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

  useEffect(() => { setPagina(0); }, [busca, filtroSit, filtroSimples, filtrarAtivas]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const visiveis = filtrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  const kpis = useMemo(() => {
    const base = linhas.filter((l) => !filtrarAtivas || l.ativa_questor);
    const c = (k: Chave) => base.filter((l) => chave(l) === k).length;
    return {
      total: base.length,
      regular: c("regular"), com_restricao: c("com_restricao"), irregular: c("irregular"),
      pendentes: c("nunca") + c("erro") + c("indefinida"),
    };
  }, [linhas, filtrarAtivas]);

  function alternar(cnpj: string) {
    setSelecionados((atual) => {
      const n = new Set(atual);
      if (n.has(cnpj)) n.delete(cnpj); else n.add(cnpj);
      return n;
    });
  }
  const todosMarcados = visiveis.length > 0 && visiveis.every((l) => selecionados.has(l.cnpj));
  function marcarPagina() {
    setSelecionados((atual) => {
      const n = new Set(atual);
      visiveis.forEach((l) => (todosMarcados ? n.delete(l.cnpj) : n.add(l.cnpj)));
      return n;
    });
  }

  /** Laço no navegador: uma empresa por requisição. Resposta não-JSON (timeout) conta como falha, não quebra o lote. */
  async function consultar(alvos: Linha[], respeitarHoje = pularHoje) {
    const fila = respeitarHoje ? alvos.filter((l) => (l.consultado_em ?? "").slice(0, 10) !== hoje()) : alvos;
    if (!fila.length) { setMsg("As empresas selecionadas já foram consultadas hoje."); return; }
    const quem = fila.length === 1 ? (fila[0].razao_social ?? formatCNPJ(fila[0].cnpj)) : `${fila.length} empresas`;
    if (!confirm(`Consultar ${quem} na Receita?\n\nCada consulta é cobrada pelo SERPRO e gera um relatório novo.`)) return;

    parar.current = false;
    setMsg(null);
    setDetalhe(null);
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
    const status = parar.current ? "Interrompido" : "Concluído";
    setLote(null);
    setMsg(`${status}: ${fila.length - falhas} consultada(s) com sucesso, ${falhas} com falha.${erros.length ? "\n" + erros.slice(0, 8).join("\n") : ""}`);
    setSelecionados(new Set());
    carregar();
  }

  async function reclassificar() {
    setReclassificando(true);
    setMsg("Reclassificando os relatórios salvos…");
    let total = 0, mudaram = 0;
    try {
      for (let volta = 0; volta < 100; volta++) {
        const r = await fetch("/api/fiscal/situacao-fiscal", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "reclassificar" }),
        });
        const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        if (!r.ok) { setMsg(`Falha ao reclassificar: ${j.error}`); return; }
        total += j.processadas; mudaram += j.mudaram;
        setMsg(`Reclassificando… ${total} processados, faltam ${j.restantes}.`);
        if (!j.restantes || !j.processadas) break;
      }
      setMsg(total
        ? `Reclassificação concluída: ${total} relatórios, ${mudaram} mudaram de situação.`
        : "Nada a reclassificar: todos os relatórios já estão na regra atual.");
      carregar();
    } finally {
      setReclassificando(false);
    }
  }

  function baixarCsv() {
    const cab = ["Código", "Razão social", "CNPJ", "Situação", "Pendências", "Resumo", "Simples", "Certidão", "Validade certidão", "Consultado em"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const corpo = filtrados.map((l) => [
      l.codigoempresa, l.razao_social, formatCNPJ(l.cnpj), ROTULO[chave(l)], l.pendencias, l.resumo,
      simples(l).texto, l.certidao_tipo, dataBR(l.certidao_validade), dataBR(l.consultado_em),
    ].map(esc).join(";"));
    const blob = new Blob(["﻿" + [cab.map(esc).join(";"), ...corpo].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `situacao-fiscal_${hoje()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const ocupado = !!lote || reclassificando;
  const selecionadasLinhas = linhas.filter((l) => selecionados.has(l.cnpj));
  const pct = (n: number) => (kpis.total ? Math.round((n / kpis.total) * 100) : 0);

  const kpi = (k: "" | Chave, rotulo: string, valor: number, desc: string, cor: string) => (
    <button type="button" className={`${s.kpi} ${filtroSit === k && k ? s.ativo : ""}`} style={tom(cor)}
            onClick={() => setFiltroSit(filtroSit === k || !k ? "" : k)}>
      <div className={s.kpiRotulo}>{rotulo}</div>
      <div className={s.kpiValor}>{valor.toLocaleString("pt-BR")}</div>
      <div className={s.kpiDesc}>{desc}</div>
      {k && <div className={s.kpiBarra}><span style={{ width: `${pct(valor)}%` }} /></div>}
    </button>
  );

  return (
    <div className={s.wrap}>
      {erro && <div className={`${s.aviso} ${s.erro}`}><strong>Erro:</strong> {erro}</div>}
      {aviso && <div className={s.aviso}>{aviso}</div>}

      <div className={s.kpis}>
        {kpi("", "Empresas", kpis.total, filtrarAtivas ? "ativas no Questor" : "com relatório salvo", "#475569")}
        {kpi("regular", "Regulares", kpis.regular, `${pct(kpis.regular)}% · sem pendências`, TOM.regular)}
        {kpi("com_restricao", "Com restrição", kpis.com_restricao, `${pct(kpis.com_restricao)}% · exigibilidade suspensa`, TOM.com_restricao)}
        {kpi("irregular", "Irregulares", kpis.irregular, `${pct(kpis.irregular)}% · débito exigível`, TOM.irregular)}
        {kpi("erro", "A revisar", kpis.pendentes, "erro, indefinida ou sem consulta", TOM.erro)}
      </div>

      {msg && (
        <div className={`${s.aviso} ${s.info}`}>
          <span>{msg}</span>
          <button className={s.avisoFechar} onClick={() => setMsg(null)} aria-label="Fechar">×</button>
        </div>
      )}

      <div className={s.painel}>
        <div className={s.barra}>
          <label className={s.busca}>
            {Ico.busca}
            <input placeholder="Buscar por razão social, CNPJ ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <select className={s.select} value={filtroSit} onChange={(e) => setFiltroSit(e.target.value as typeof filtroSit)}>
            <option value="">Todas as situações</option>
            {(Object.keys(ROTULO) as Chave[]).map((k) => <option key={k} value={k}>{ROTULO[k]}</option>)}
          </select>
          <select className={s.select} value={filtroSimples} onChange={(e) => setFiltroSimples(e.target.value as typeof filtroSimples)}>
            <option value="">Simples: todos</option>
            <option value="optante">Optante do Simples</option>
            <option value="saindo">Saída agendada</option>
            <option value="mei">MEI (SIMEI)</option>
            <option value="nao">Não optante</option>
          </select>
          {temCarteira && (
            <button type="button" className={`${s.toggle} ${soAtivas ? s.on : ""}`} onClick={() => setSoAtivas((v) => !v)}>
              Só carteira ativa
            </button>
          )}
          <span className={s.espaco} />
          <button className={s.botao} onClick={reclassificar} disabled={ocupado}
                  title="Reaplica a regra de classificação nos relatórios já salvos. Não consulta a Receita (sem custo).">
            {Ico.regra} {reclassificando ? "Reclassificando…" : "Reclassificar"}
          </button>
          <button className={s.botao} onClick={baixarCsv} disabled={!filtrados.length}>{Ico.csv} Exportar CSV</button>
        </div>

        {lote ? (
          <div className={s.selecao}>
            <strong>Consultando {lote.feitos + 1} de {lote.total}</strong>
            <span className={s.progresso}><span style={{ width: `${(lote.feitos / lote.total) * 100}%` }} /></span>
            <span className={s.custo}>{lote.atual} · {lote.falhas} falha(s)</span>
            <button className={`${s.botao} ${s.perigo}`} onClick={() => { parar.current = true; }}>Parar</button>
          </div>
        ) : selecionadasLinhas.length > 0 && (
          <div className={s.selecao}>
            <strong>{selecionadasLinhas.length} selecionada(s)</strong>
            <button className={`${s.botao} ${s.primario}`} onClick={() => consultar(selecionadasLinhas)}>
              {Ico.consultar} Consultar na Receita
            </button>
            <label className={s.check}>
              <input type="checkbox" checked={pularHoje} onChange={(e) => setPularHoje(e.target.checked)} />
              pular quem já foi consultado hoje
            </label>
            <span className={s.custo}>{Ico.moeda} cada consulta é cobrada pelo SERPRO</span>
            <span className={s.espaco} />
            <button className={s.botao} onClick={() => setSelecionados(new Set())}>Limpar seleção</button>
          </div>
        )}

        <div className={s.tabelaWrap}>
          <table className={s.tabela}>
            <thead>
              <tr>
                <th className={s.colCheck}>
                  <input type="checkbox" checked={todosMarcados} onChange={marcarPagina} disabled={ocupado || !visiveis.length}
                         aria-label="Selecionar a página" />
                </th>
                <th>Empresa</th>
                <th>Situação</th>
                <th>Simples Nacional</th>
                <th>Última consulta</th>
                <th className={s.colAcoes}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <tr><td className={s.vazio} colSpan={6}>Carregando empresas…</td></tr>}
              {!carregando && visiveis.length === 0 && (
                <tr><td className={s.vazio} colSpan={6}>Nenhuma empresa com esses filtros.</td></tr>
              )}
              {!carregando && visiveis.map((l) => {
                const k = chave(l);
                const sn = simples(l);
                const marcada = selecionados.has(l.cnpj);
                return (
                  <tr key={l.cnpj} className={marcada ? s.marcada : undefined}>
                    <td className={s.colCheck}>
                      <input type="checkbox" checked={marcada} onChange={() => alternar(l.cnpj)} disabled={ocupado}
                             aria-label={`Selecionar ${l.razao_social ?? l.cnpj}`} />
                    </td>
                    <td>
                      <div className={s.empresa}>
                        <span className={s.avatar}>{iniciais(l.razao_social)}</span>
                        <div>
                          <div className={s.empresaNome}>{l.razao_social ?? "—"}</div>
                          <div className={s.empresaSub}>
                            {formatCNPJ(l.cnpj)}
                            {l.codigoempresa != null && <> · cód. {l.codigoempresa}</>}
                            {temCarteira && !l.ativa_questor && <span className={s.fora}>fora da carteira</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={s.pill} style={tom(TOM[k])} title={(k === "erro" ? l.mensagem : l.resumo) ?? undefined}>
                        <i />{ROTULO[k]}
                      </span>
                    </td>
                    <td>
                      {sn.cor
                        ? <span className={s.pill} style={tom(sn.cor)}>{sn.texto}</span>
                        : <span className={`${s.pill} ${s.pillSuave}`}>{sn.texto}</span>}
                    </td>
                    <td>
                      <div className={s.data}>{dataBR(l.consultado_em)}</div>
                      <div className={s.dataSub}>{haQuanto(l.consultado_em)}</div>
                    </td>
                    <td className={s.colAcoes}>
                      <div className={s.acoes}>
                        <button className={s.icone} title="Ver detalhes" onClick={() => setDetalhe(l)}>{Ico.olho}</button>
                        <a className={s.icone} title={l.tem_pdf ? "Abrir relatório (PDF)" : "Sem relatório salvo"}
                           aria-disabled={!l.tem_pdf} href={l.tem_pdf ? `/api/fiscal/situacao-fiscal/pdf?cnpj=${l.cnpj}` : undefined}
                           target="_blank" rel="noreferrer">{Ico.pdf}</a>
                        <button className={s.icone} title="Consultar na Receita (cobrado)" disabled={ocupado}
                                onClick={() => consultar([l], false)}>{Ico.consultar}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className={s.rodape}>
          <span>
            {filtrados.length ? `${pagina * POR_PAGINA + 1}–${Math.min((pagina + 1) * POR_PAGINA, filtrados.length)} de ` : ""}
            {filtrados.length.toLocaleString("pt-BR")} empresa(s)
            {filtrados.length !== linhas.length && ` · ${linhas.length.toLocaleString("pt-BR")} no total`}
          </span>
          <div className={s.paginas}>
            <button className={s.botao} disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>‹ Anterior</button>
            <span>{pagina + 1} / {totalPaginas}</span>
            <button className={s.botao} disabled={pagina >= totalPaginas - 1} onClick={() => setPagina((p) => p + 1)}>Próxima ›</button>
          </div>
        </div>
      </div>

      {detalhe && (
        <>
          <div className={s.fundo} onClick={() => setDetalhe(null)} />
          <aside className={s.lateral} role="dialog" aria-label="Detalhes da empresa">
            <div className={s.lateralTopo}>
              <span className={s.avatar}>{iniciais(detalhe.razao_social)}</span>
              <div style={{ flex: 1 }}>
                <h3>{detalhe.razao_social ?? "—"}</h3>
                <div className={s.empresaSub}>{formatCNPJ(detalhe.cnpj)}{detalhe.codigoempresa != null && ` · cód. ${detalhe.codigoempresa}`}</div>
              </div>
              <button className={s.avisoFechar} onClick={() => setDetalhe(null)} aria-label="Fechar">×</button>
            </div>
            <div className={s.lateralCorpo}>
              <div className={s.campo}>
                <span className={s.campoRotulo}>Situação</span>
                <span><span className={s.pill} style={tom(TOM[chave(detalhe)])}><i />{ROTULO[chave(detalhe)]}</span></span>
              </div>
              <div className={s.campo}>
                <span className={s.campoRotulo}>{chave(detalhe) === "erro" ? "Retorno da Receita" : "Resumo"}</span>
                <span className={s.campoValor}>{(chave(detalhe) === "erro" ? detalhe.mensagem : detalhe.resumo) ?? "—"}</span>
              </div>
              <div className={s.grade2}>
                <div className={s.campo}>
                  <span className={s.campoRotulo}>Pendências</span>
                  <span className={s.campoValor}>{detalhe.pendencias ?? "—"}</span>
                </div>
                <div className={s.campo}>
                  <span className={s.campoRotulo}>Última consulta</span>
                  <span className={s.campoValor}>{dataBR(detalhe.consultado_em)} <span className={s.dataSub}>{haQuanto(detalhe.consultado_em)}</span></span>
                </div>
                <div className={s.campo}>
                  <span className={s.campoRotulo}>Simples Nacional</span>
                  <span className={s.campoValor}>
                    {simples(detalhe).texto}
                    {detalhe.simples_inclusao && <span className={s.dataSub}> · desde {dataBR(detalhe.simples_inclusao)}</span>}
                  </span>
                </div>
                <div className={s.campo}>
                  <span className={s.campoRotulo}>Certidão</span>
                  <span className={s.campoValor}>
                    {detalhe.certidao_tipo ?? "—"}
                    {detalhe.certidao_validade && <span className={s.dataSub}> · válida até {dataBR(detalhe.certidao_validade)}</span>}
                  </span>
                </div>
              </div>
            </div>
            <div className={s.lateralPe}>
              {detalhe.tem_pdf && (
                <a className={s.botao} href={`/api/fiscal/situacao-fiscal/pdf?cnpj=${detalhe.cnpj}`} target="_blank" rel="noreferrer">
                  {Ico.pdf} Abrir PDF
                </a>
              )}
              <button className={`${s.botao} ${s.primario}`} disabled={ocupado} onClick={() => consultar([detalhe], false)}>
                {Ico.consultar} Consultar na Receita
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
