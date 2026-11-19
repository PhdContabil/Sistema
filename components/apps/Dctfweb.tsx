"use client";

// Fiscal · DCTFWeb. Abrir a tela NÃO chama a Receita: lê o banco. Sincronizar
// obrigadas (Questor) é grátis; consultar, guia, recibo e transmitir chamam o
// SERPRO (cobrado) e acontecem por clique — uma declaração por requisição,
// num laço com progresso e botão parar. Layout padrão (PainelPadrao.module.css).

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { formatBRL, formatCNPJ } from "@/lib/conciliacao";
import { divergente, motivoBloqueio, type SituacaoDctf } from "@/lib/dctfweb-regras";
import s from "./PainelPadrao.module.css";
import SemMovimento from "./DctfwebSemMovimento";

interface Linha {
  id: number;
  cnpj: string;
  razao_social: string | null;
  codigoempresa: number | null;
  competencia: string;
  situacao: SituacaoDctf;
  recibo_numero: string | null;
  debito: number | null;
  debito_folha: number | null;
  debito_reinf: number | null;
  origem: string | null;
  valor_guia: number | null;
  nao_transmitir: boolean;
  transmitida_em: string | null;
  transmissao_erro: string | null;
  ultima_consulta: string | null;
}

interface Parametros { dia_transmissao: number; auto_transmissao: boolean; consultar_antes: boolean; lote_ts: string | null; updated_at: string | null; updated_by: string | null }
interface Execucao { criado_em: string; sucesso: boolean; detalhe: Record<string, unknown> }

type Filtro = "" | SituacaoDctf | "revisar" | "travada" | "sem_debito" | "a_transmitir";
const FILTROS_ESPECIAIS: Filtro[] = ["revisar", "travada", "sem_debito", "a_transmitir"];

const ROTULO: Record<SituacaoDctf, string> = {
  pendente: "Pendente", em_andamento: "Em andamento", transmitida: "Transmitida", erro: "Erro",
};
const TOM: Record<SituacaoDctf | "revisar", string> = {
  pendente: "#64748b", em_andamento: "#d97706", transmitida: "#16a34a", erro: "#dc2626", revisar: "#9333ea",
};
const POR_PAGINA = 50;

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tom = (cor: string) => ({ "--tom": cor }) as CSSProperties;
const dataBR = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const compBR = (c: string | null) => (c ? `${c.slice(5, 7)}/${c.slice(0, 4)}` : "—");
const brl = (v: number | null) => (v == null ? "—" : `R$ ${formatBRL(Number(v))}`);
const revisar = (l: Linha) => l.situacao === "transmitida" && divergente(l.debito, l.valor_guia);

function iniciais(nome: string | null): string {
  const p = (nome ?? "").replace(/^[\d.\s]+/, "").split(/\s+/).filter((x) => x.length > 1);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "—";
}

/** Competência anterior ao mês atual (a que se transmite agora). */
function competenciaPadrao(): string {
  const d = new Date();
  const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`;
}

const Ico = {
  busca: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  olho: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>,
  consultar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>,
  guia: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></svg>,
  recibo: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 14l2 2 4-4" /></svg>,
  enviar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></svg>,
  cadeado: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>,
  sync: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" /></svg>,
  csv: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" /></svg>,
  moeda: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1.1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5v11" /></svg>,
};

export default function Dctfweb() {
  const [aba, setAba] = useState<"declaracoes" | "sem_movimento" | "parametros">("declaracoes");
  return (
    <div className={s.wrap}>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className={`${s.toggle} ${aba === "declaracoes" ? s.on : ""}`} onClick={() => setAba("declaracoes")}>Declarações</button>
        <button type="button" className={`${s.toggle} ${aba === "sem_movimento" ? s.on : ""}`} onClick={() => setAba("sem_movimento")}>Sem movimento</button>
        <button type="button" className={`${s.toggle} ${aba === "parametros" ? s.on : ""}`} onClick={() => setAba("parametros")}>Parâmetros e agendamento</button>
      </div>
      {aba === "declaracoes" ? <Declaracoes /> : aba === "sem_movimento" ? <SemMovimento /> : <ParametrosDctf />}
    </div>
  );
}

// ======================================================================
// Declarações
// ======================================================================

function Declaracoes() {
  const [competencias, setCompetencias] = useState<string[]>([]);
  const [competencia, setCompetencia] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("");
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [pagina, setPagina] = useState(0);
  const [detalhe, setDetalhe] = useState<Linha | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);

  const [lote, setLote] = useState<{ acao: string; feitos: number; total: number; falhas: number; atual: string } | null>(null);
  const parar = useRef(false);

  const carregar = useCallback(async (comp?: string | null) => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/fiscal/dctfweb${comp ? `?competencia=${comp}` : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falha ao carregar.");
      setCompetencias(j.competencias);
      setCompetencia(j.competencia);
      setLinhas(j.linhas);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { setPagina(0); setSelecionados(new Set()); }, [busca, filtro, competencia]);

  const opcoesCompetencia = useMemo(() => {
    const padrao = competenciaPadrao();
    return [...new Set([padrao, ...competencias])].sort().reverse();
  }, [competencias]);

  const filtrados = useMemo(() => {
    const q = semAcento(busca.trim());
    const qDig = busca.replace(/\D/g, "");
    return linhas.filter((l) => {
      if (filtro === "revisar" && !revisar(l)) return false;
      if (filtro === "travada" && !l.nao_transmitir) return false;
      if (filtro === "sem_debito" && Number(l.debito) > 0) return false;
      if (filtro === "a_transmitir" && motivoBloqueio(l)) return false;
      if (filtro && !FILTROS_ESPECIAIS.includes(filtro) && l.situacao !== filtro) return false;
      if (!q) return true;
      return semAcento(l.razao_social ?? "").includes(q) || (qDig.length >= 3 && l.cnpj.includes(qDig))
        || String(l.codigoempresa ?? "") === busca.trim();
    });
  }, [linhas, busca, filtro]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const visiveis = filtrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  const kpis = useMemo(() => {
    const c = (f: (l: Linha) => boolean) => linhas.filter(f).length;
    return {
      total: linhas.length,
      transmitida: c((l) => l.situacao === "transmitida"),
      aTransmitir: c((l) => !motivoBloqueio(l)),
      erro: c((l) => l.situacao === "erro"),
      revisar: c(revisar),
      debito: linhas.reduce((t, l) => t + (Number(l.debito) || 0), 0),
    };
  }, [linhas]);
  const pct = (n: number) => (kpis.total ? Math.round((n / kpis.total) * 100) : 0);

  async function sincronizar() {
    const comp = competencia ?? competenciaPadrao();
    setSincronizando(true);
    setMsg(null);
    try {
      const r = await fetch("/api/fiscal/dctfweb", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "sincronizar", competencia: comp }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg(`Obrigadas de ${compBR(comp)} sincronizadas com o Questor: ${j.gravadas} empresa(s).`);
      await carregar(comp);
    } catch (e) {
      setMsg(`Falha ao sincronizar: ${e instanceof Error ? e.message : "erro"}`);
    } finally {
      setSincronizando(false);
    }
  }

  /** Laço no navegador: uma declaração por requisição; resposta não-JSON (timeout) conta como falha. */
  async function emLote(acao: "consultar" | "transmitir", alvos: Linha[]) {
    const fila = acao === "transmitir" ? alvos.filter((l) => !motivoBloqueio(l)) : alvos;
    const bloqueadas = alvos.length - fila.length;
    if (!fila.length) { setMsg("Nenhuma das selecionadas pode ser transmitida (já transmitida, travada ou sem débito)."); return; }
    const quem = fila.length === 1 ? (fila[0].razao_social ?? formatCNPJ(fila[0].cnpj)) : `${fila.length} declarações`;
    const aviso = acao === "transmitir"
      ? `TRANSMITIR ${quem} de ${compBR(competencia)} na Receita?\n\nA transmissão é IRREVERSÍVEL e cada chamada é cobrada pelo SERPRO.${bloqueadas ? `\n${bloqueadas} selecionada(s) ficam de fora (já transmitida, travada ou sem débito).` : ""}`
      : `Consultar a situação de ${quem} na Receita?\n\nCada consulta é cobrada pelo SERPRO.`;
    if (!confirm(aviso)) return;

    parar.current = false;
    setMsg(null);
    setDetalhe(null);
    let falhas = 0, ok = 0, pulou = 0;
    const erros: string[] = [];
    for (let i = 0; i < fila.length; i++) {
      if (parar.current) break;
      const l = fila[i];
      setLote({ acao, feitos: i, total: fila.length, falhas, atual: l.razao_social ?? formatCNPJ(l.cnpj) });
      try {
        const r = await fetch("/api/fiscal/dctfweb", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao, id: l.id }),
        });
        const j = await r.json().catch(() => ({ error: `Resposta inválida (HTTP ${r.status}).` }));
        if (!r.ok || !j.ok) { falhas++; erros.push(`${l.razao_social ?? l.cnpj}: ${j.error ?? j.mensagem ?? j.motivo ?? "falhou"}`); }
        else if (j.pulou) pulou++;
        else ok++;
      } catch (e) {
        falhas++;
        erros.push(`${l.razao_social ?? l.cnpj}: ${e instanceof Error ? e.message : "falha de rede"}`);
      }
    }
    const verbo = acao === "transmitir" ? "transmitida(s)" : "consultada(s)";
    setLote(null);
    setMsg(`${parar.current ? "Interrompido" : "Concluído"}: ${ok} ${verbo}${pulou ? `, ${pulou} já estavam transmitidas` : ""}, ${falhas} com falha.`
      + (erros.length ? "\n" + erros.slice(0, 8).join("\n") : ""));
    setSelecionados(new Set());
    carregar(competencia);
  }

  async function travar(l: Linha) {
    const r = await fetch("/api/fiscal/dctfweb", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "trava", id: l.id, valor: !l.nao_transmitir }),
    });
    if (!r.ok) { setMsg("Falha ao alterar a trava."); return; }
    setLinhas((ls) => ls.map((x) => (x.id === l.id ? { ...x, nao_transmitir: !l.nao_transmitir } : x)));
    setDetalhe((d) => (d && d.id === l.id ? { ...d, nao_transmitir: !l.nao_transmitir } : d));
  }

  /** Guia/recibo: emitidos na hora pelo SERPRO (cobrado); abre o PDF em nova aba. */
  async function documento(l: Linha, tipo: "guia" | "recibo") {
    const nome = tipo === "guia" ? "a guia (DARF)" : "o recibo";
    if (!confirm(`Emitir ${nome} de ${l.razao_social ?? formatCNPJ(l.cnpj)} (${compBR(l.competencia)})?\n\nA chamada é cobrada pelo SERPRO.`)) return;
    const aba = window.open("", "_blank");
    setBaixando(`${l.id}-${tipo}`);
    try {
      const r = await fetch(`/api/fiscal/dctfweb/documento?id=${l.id}&tipo=${tipo}`, { cache: "no-store" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        aba?.close();
        setMsg(`${l.razao_social ?? l.cnpj}: ${j.error ?? "não foi possível emitir."}`);
        return;
      }
      const url = URL.createObjectURL(await r.blob());
      if (aba) aba.location.href = url; else window.open(url, "_blank");
      if (tipo === "guia") carregar(competencia); // a emissão pode corrigir a situação
    } finally {
      setBaixando(null);
    }
  }

  function baixarCsv() {
    const cab = ["Código", "Razão social", "CNPJ", "Competência", "Situação", "Débito Questor", "Folha", "REINF", "Valor guia RFB", "Revisar", "Origem", "Travada", "Transmitida em", "Erro"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const num = (v: number | null) => (v == null ? "" : formatBRL(Number(v)));
    const corpo = filtrados.map((l) => [
      l.codigoempresa, l.razao_social, formatCNPJ(l.cnpj), compBR(l.competencia), ROTULO[l.situacao],
      num(l.debito), num(l.debito_folha), num(l.debito_reinf), num(l.valor_guia), revisar(l) ? "sim" : "",
      l.origem, l.nao_transmitir ? "sim" : "", dataHora(l.transmitida_em), l.transmissao_erro,
    ].map(esc).join(";"));
    const blob = new Blob(["﻿" + [cab.map(esc).join(";"), ...corpo].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dctfweb_${competencia ?? "sem-competencia"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const ocupado = !!lote || sincronizando;
  const selecionadas = linhas.filter((l) => selecionados.has(l.id));
  const todosMarcados = visiveis.length > 0 && visiveis.every((l) => selecionados.has(l.id));

  const kpi = (f: Filtro, rotulo: string, valor: string | number, desc: string, cor: string, barra?: number) => (
    <button type="button" className={`${s.kpi} ${filtro === f && f ? s.ativo : ""}`} style={tom(cor)}
            onClick={() => setFiltro(filtro === f || !f ? "" : f)}>
      <div className={s.kpiRotulo}>{rotulo}</div>
      <div className={s.kpiValor} style={typeof valor === "string" ? { fontSize: 20 } : undefined}>
        {typeof valor === "number" ? valor.toLocaleString("pt-BR") : valor}
      </div>
      <div className={s.kpiDesc}>{desc}</div>
      {barra != null && <div className={s.kpiBarra}><span style={{ width: `${barra}%` }} /></div>}
    </button>
  );

  return (
    <>
      {erro && <div className={`${s.aviso} ${s.erro}`}><strong>Erro:</strong> {erro}</div>}

      <div className={s.kpis}>
        {kpi("", "Obrigadas", kpis.total, `competência ${compBR(competencia)}`, "#475569")}
        {kpi("transmitida", "Transmitidas", kpis.transmitida, `${pct(kpis.transmitida)}% da competência`, TOM.transmitida, pct(kpis.transmitida))}
        {kpi("a_transmitir", "A transmitir", kpis.aTransmitir, "com débito, sem trava", TOM.em_andamento, pct(kpis.aTransmitir))}
        {kpi("revisar", "A revisar", kpis.revisar + kpis.erro, `${kpis.revisar} divergência(s) · ${kpis.erro} erro(s)`, TOM.revisar)}
        {kpi("", "Débito apurado", brl(kpis.debito), "soma do Questor", "#2563eb")}
      </div>

      {msg && (
        <div className={`${s.aviso} ${s.info}`}>
          <span>{msg}</span>
          <button className={s.avisoFechar} onClick={() => setMsg(null)} aria-label="Fechar">×</button>
        </div>
      )}

      <div className={s.painel}>
        <div className={s.barra}>
          <select className={s.select} value={competencia ?? ""} disabled={ocupado}
                  onChange={(e) => { setCompetencia(e.target.value); carregar(e.target.value); }} aria-label="Competência">
            {opcoesCompetencia.map((c) => <option key={c} value={c}>{compBR(c)}{competencias.includes(c) ? "" : " (nova)"}</option>)}
          </select>
          <label className={s.busca}>
            {Ico.busca}
            <input placeholder="Buscar por razão social, CNPJ ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <select className={s.select} value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
            <option value="">Todas as situações</option>
            {(Object.keys(ROTULO) as SituacaoDctf[]).map((k) => <option key={k} value={k}>{ROTULO[k]}</option>)}
            <option value="a_transmitir">A transmitir</option>
            <option value="revisar">Divergência Questor × Receita</option>
            <option value="travada">Travadas</option>
            <option value="sem_debito">Sem débito</option>
          </select>
          <span className={s.espaco} />
          <button className={s.botao} onClick={sincronizar} disabled={ocupado}
                  title="Traz do Questor quem deve entregar na competência (sem custo).">
            {Ico.sync} {sincronizando ? "Sincronizando…" : "Sincronizar obrigadas"}
          </button>
          <button className={s.botao} onClick={baixarCsv} disabled={!filtrados.length}>{Ico.csv} Exportar CSV</button>
        </div>

        {lote ? (
          <div className={s.selecao}>
            <strong>{lote.acao === "transmitir" ? "Transmitindo" : "Consultando"} {lote.feitos + 1} de {lote.total}</strong>
            <span className={s.progresso}><span style={{ width: `${(lote.feitos / lote.total) * 100}%` }} /></span>
            <span className={s.custo}>{lote.atual} · {lote.falhas} falha(s)</span>
            <button className={`${s.botao} ${s.perigo}`} onClick={() => { parar.current = true; }}>Parar</button>
          </div>
        ) : selecionadas.length > 0 && (
          <div className={s.selecao}>
            <strong>{selecionadas.length} selecionada(s)</strong>
            <button className={s.botao} onClick={() => emLote("consultar", selecionadas)}>{Ico.consultar} Consultar situação</button>
            <button className={`${s.botao} ${s.primario}`} onClick={() => emLote("transmitir", selecionadas)}>{Ico.enviar} Transmitir</button>
            <span className={s.custo}>{Ico.moeda} cada chamada é cobrada pelo SERPRO · transmissão é irreversível</span>
            <span className={s.espaco} />
            <button className={s.botao} onClick={() => setSelecionados(new Set())}>Limpar seleção</button>
          </div>
        )}

        <div className={s.tabelaWrap}>
          <table className={s.tabela}>
            <thead>
              <tr>
                <th className={s.colCheck}>
                  <input type="checkbox" checked={todosMarcados} disabled={ocupado || !visiveis.length} aria-label="Selecionar a página"
                         onChange={() => setSelecionados((atual) => {
                           const n = new Set(atual);
                           visiveis.forEach((l) => (todosMarcados ? n.delete(l.id) : n.add(l.id)));
                           return n;
                         })} />
                </th>
                <th>Empresa</th>
                <th>Situação</th>
                <th style={{ textAlign: "right" }}>Débito Questor</th>
                <th style={{ textAlign: "right" }}>Guia Receita</th>
                <th>Origem</th>
                <th className={s.colAcoes}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <tr><td className={s.vazio} colSpan={7}>Carregando declarações…</td></tr>}
              {!carregando && visiveis.length === 0 && (
                <tr><td className={s.vazio} colSpan={7}>
                  {linhas.length ? "Nenhuma declaração com esses filtros." : "Nada nesta competência ainda — use “Sincronizar obrigadas”."}
                </td></tr>
              )}
              {!carregando && visiveis.map((l) => {
                const marcada = selecionados.has(l.id);
                const rev = revisar(l);
                const bloqueio = motivoBloqueio(l);
                return (
                  <tr key={l.id} className={marcada ? s.marcada : undefined}>
                    <td className={s.colCheck}>
                      <input type="checkbox" checked={marcada} disabled={ocupado} aria-label={`Selecionar ${l.razao_social ?? l.cnpj}`}
                             onChange={() => setSelecionados((atual) => {
                               const n = new Set(atual);
                               if (n.has(l.id)) n.delete(l.id); else n.add(l.id);
                               return n;
                             })} />
                    </td>
                    <td>
                      <div className={s.empresa}>
                        <span className={s.avatar}>{iniciais(l.razao_social)}</span>
                        <div>
                          <div className={s.empresaNome}>{l.razao_social ?? "—"}</div>
                          <div className={s.empresaSub}>
                            {formatCNPJ(l.cnpj)}{l.codigoempresa != null && <> · cód. {l.codigoempresa}</>}
                            {l.nao_transmitir && <span className={s.fora}>travada</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span className={s.pill} style={tom(TOM[l.situacao])} title={l.transmissao_erro ?? undefined}><i />{ROTULO[l.situacao]}</span>
                        {rev && <span className={s.pill} style={tom(TOM.revisar)} title="Débito do Questor difere mais de 5% da guia na Receita">Revisar</span>}
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }} className={s.data}>{brl(l.debito)}</td>
                    <td style={{ textAlign: "right" }} className={s.data}>{brl(l.valor_guia)}</td>
                    <td><span className={s.dataSub}>{l.origem ?? "—"}</span></td>
                    <td className={s.colAcoes}>
                      <div className={s.acoes}>
                        <button className={s.icone} title="Ver detalhes" onClick={() => setDetalhe(l)}>{Ico.olho}</button>
                        <button className={s.icone} title="Emitir guia (DARF) — cobrado" disabled={ocupado || baixando === `${l.id}-guia`}
                                onClick={() => documento(l, "guia")}>{Ico.guia}</button>
                        <button className={s.icone} title={l.situacao === "transmitida" ? "Recibo de entrega — cobrado" : "Recibo só existe após a transmissão"}
                                disabled={ocupado || l.situacao !== "transmitida" || baixando === `${l.id}-recibo`}
                                onClick={() => documento(l, "recibo")}>{Ico.recibo}</button>
                        <button className={s.icone} title="Consultar situação na Receita — cobrado" disabled={ocupado}
                                onClick={() => emLote("consultar", [l])}>{Ico.consultar}</button>
                        <button className={s.icone} title={bloqueio ? `Não transmite: ${bloqueio}` : "Transmitir — irreversível e cobrado"}
                                disabled={ocupado || !!bloqueio} onClick={() => emLote("transmitir", [l])}>{Ico.enviar}</button>
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
            {filtrados.length.toLocaleString("pt-BR")} declaração(ões)
            {filtrados.length !== linhas.length && ` · ${linhas.length.toLocaleString("pt-BR")} na competência`}
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
          <aside className={s.lateral} role="dialog" aria-label="Detalhes da declaração">
            <div className={s.lateralTopo}>
              <span className={s.avatar}>{iniciais(detalhe.razao_social)}</span>
              <div style={{ flex: 1 }}>
                <h3>{detalhe.razao_social ?? "—"}</h3>
                <div className={s.empresaSub}>{formatCNPJ(detalhe.cnpj)} · competência {compBR(detalhe.competencia)}</div>
              </div>
              <button className={s.avisoFechar} onClick={() => setDetalhe(null)} aria-label="Fechar">×</button>
            </div>
            <div className={s.lateralCorpo}>
              <div className={s.grade2}>
                <div className={s.campo}>
                  <span className={s.campoRotulo}>Situação</span>
                  <span><span className={s.pill} style={tom(TOM[detalhe.situacao])}><i />{ROTULO[detalhe.situacao]}</span></span>
                </div>
                <div className={s.campo}>
                  <span className={s.campoRotulo}>Origem</span>
                  <span className={s.campoValor}>{detalhe.origem ?? "—"}</span>
                </div>
                <div className={s.campo}>
                  <span className={s.campoRotulo}>Débito no Questor</span>
                  <span className={s.campoValor}>{brl(detalhe.debito)}
                    <span className={s.dataSub}> · folha {brl(detalhe.debito_folha)} · REINF {brl(detalhe.debito_reinf)}</span>
                  </span>
                </div>
                <div className={s.campo}>
                  <span className={s.campoRotulo}>Guia na Receita</span>
                  <span className={s.campoValor}>{brl(detalhe.valor_guia)}
                    {revisar(detalhe) && <span className={s.dataSub}> · diverge mais de 5% do Questor</span>}
                  </span>
                </div>
                <div className={s.campo}>
                  <span className={s.campoRotulo}>Transmitida em</span>
                  <span className={s.campoValor}>{dataHora(detalhe.transmitida_em)}</span>
                </div>
                <div className={s.campo}>
                  <span className={s.campoRotulo}>Última consulta</span>
                  <span className={s.campoValor}>{dataHora(detalhe.ultima_consulta)}</span>
                </div>
              </div>
              {revisar(detalhe) && (
                <div className={s.aviso}>
                  A diferença numa declaração transmitida costuma ser REINF que entrou depois da transmissão:
                  a declaração voltou para “em andamento” na Receita. Consulte a situação para confirmar.
                </div>
              )}
              {detalhe.transmissao_erro && (
                <div className={s.campo}>
                  <span className={s.campoRotulo}>Último erro</span>
                  <span className={s.campoValor} style={{ wordBreak: "break-word" }}>{detalhe.transmissao_erro}</span>
                </div>
              )}
              <div className={s.campo}>
                <span className={s.campoRotulo}>Trava manual</span>
                <label className={s.check}>
                  <input type="checkbox" checked={detalhe.nao_transmitir} onChange={() => travar(detalhe)} />
                  não transmitir esta empresa nesta competência (nem pela rotina automática)
                </label>
              </div>
            </div>
            <div className={s.lateralPe}>
              <button className={s.botao} disabled={ocupado} onClick={() => documento(detalhe, "guia")}>{Ico.guia} Guia</button>
              {detalhe.situacao === "transmitida" && (
                <button className={s.botao} disabled={ocupado} onClick={() => documento(detalhe, "recibo")}>{Ico.recibo} Recibo</button>
              )}
              <button className={s.botao} disabled={ocupado} onClick={() => emLote("consultar", [detalhe])}>{Ico.consultar} Consultar</button>
              <button className={`${s.botao} ${s.primario}`} disabled={ocupado || !!motivoBloqueio(detalhe)}
                      title={motivoBloqueio(detalhe) ?? undefined} onClick={() => emLote("transmitir", [detalhe])}>
                {Ico.enviar} Transmitir
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

// ======================================================================
// Parâmetros e agendamento
// ======================================================================

function ParametrosDctf() {
  const [p, setP] = useState<Parametros | null>(null);
  const [historico, setHistorico] = useState<Execucao[]>([]);
  const [cronOk, setCronOk] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/fiscal/dctfweb/parametros", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) { setErro(j.error); return; }
    setP(j.parametros);
    setHistorico(j.historico);
    setCronOk(j.cronConfigurado);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvar() {
    if (!p) return;
    if (p.auto_transmissao && !confirm(
      `Ligar a transmissão AUTOMÁTICA?\n\nTodo dia ${p.dia_transmissao}, às 08:00, o Núcleo transmite a competência anterior de todas as empresas com débito e sem trava.\n\nConfirme que a automação do app antigo (phd-empresas) está DESLIGADA, para as duas não rodarem juntas.`,
    )) return;
    setSalvando(true);
    setMsg(null);
    try {
      const r = await fetch("/api/fiscal/dctfweb/parametros", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dia_transmissao: p.dia_transmissao, auto_transmissao: p.auto_transmissao, consultar_antes: p.consultar_antes }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setP(j.parametros);
      setMsg("Parâmetros salvos.");
    } catch (e) {
      setMsg(`Falha ao salvar: ${e instanceof Error ? e.message : "erro"}`);
    } finally {
      setSalvando(false);
    }
  }

  if (erro) return <div className={`${s.aviso} ${s.erro}`}><strong>Erro:</strong> {erro}</div>;
  if (!p) return <div className={s.painel}><div className={s.vazio} style={{ padding: 40 }}>Carregando…</div></div>;

  const rodando = !!p.lote_ts && Date.now() - Date.parse(p.lote_ts) < 120_000;

  return (
    <>
      {!cronOk && (
        <div className={`${s.aviso} ${s.erro}`}>
          A variável <code>CRON_SECRET</code> não está configurada neste ambiente: a rotina automática não vai rodar.
        </div>
      )}
      {msg && (
        <div className={`${s.aviso} ${s.info}`}>
          <span>{msg}</span>
          <button className={s.avisoFechar} onClick={() => setMsg(null)} aria-label="Fechar">×</button>
        </div>
      )}

      <div className={s.kpis} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <div className={s.kpi} style={{ ...tom(p.auto_transmissao ? "#16a34a" : "#64748b"), cursor: "default" }}>
          <div className={s.kpiRotulo}>Transmissão automática</div>
          <div className={s.kpiValor}>{p.auto_transmissao ? "Ligada" : "Desligada"}</div>
          <div className={s.kpiDesc}>{rodando ? "rodando agora" : p.auto_transmissao ? `todo dia ${p.dia_transmissao}, 08:00` : "só por clique"}</div>
        </div>
        <div className={s.kpi} style={{ ...tom("#2563eb"), cursor: "default" }}>
          <div className={s.kpiRotulo}>Dia da transmissão</div>
          <div className={s.kpiValor}>{p.dia_transmissao}</div>
          <div className={s.kpiDesc}>competência anterior</div>
        </div>
        <div className={s.kpi} style={{ ...tom("#475569"), cursor: "default" }}>
          <div className={s.kpiRotulo}>Última alteração</div>
          <div className={s.kpiValor} style={{ fontSize: 16 }}>{dataHora(p.updated_at)}</div>
          <div className={s.kpiDesc}>{p.updated_by ?? "—"}</div>
        </div>
      </div>

      <div className={s.painel}>
        <div className={s.lateralCorpo} style={{ maxWidth: 720 }}>
          <div className={s.campo}>
            <span className={s.campoRotulo}>Dia do mês da transmissão (1 a 28)</span>
            <input type="number" min={1} max={28} className={s.select} style={{ width: 120 }} value={p.dia_transmissao}
                   onChange={(e) => setP({ ...p, dia_transmissao: Number(e.target.value) })} />
            <span className={s.dataSub}>Nesse dia, às 08:00 (Brasília), a rotina sincroniza as obrigadas do Questor e transmite a competência anterior.</span>
          </div>
          <label className={s.check}>
            <input type="checkbox" checked={p.auto_transmissao} onChange={(e) => setP({ ...p, auto_transmissao: e.target.checked })} />
            <span><strong>Transmitir automaticamente</strong> no dia configurado</span>
          </label>
          <label className={s.check}>
            <input type="checkbox" checked={p.consultar_antes} onChange={(e) => setP({ ...p, consultar_antes: e.target.checked })} />
            <span>Consultar a situação na Receita antes de transmitir (uma chamada a mais por empresa; a Receita já bloqueia retransmissão)</span>
          </label>
          <div className={s.aviso}>
            Só entram na transmissão empresas ativas com débito apurado maior que zero, ainda não transmitidas e sem a trava “não transmitir”.
          </div>
          <div>
            <button className={`${s.botao} ${s.primario}`} onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar parâmetros"}</button>
          </div>
        </div>
      </div>

      <div className={s.painel}>
        <div className={s.barra}><strong>Últimas execuções da rotina</strong></div>
        <div className={s.tabelaWrap}>
          <table className={s.tabela}>
            <thead><tr><th>Quando</th><th>Resultado</th><th>Detalhe</th></tr></thead>
            <tbody>
              {!historico.length && <tr><td className={s.vazio} colSpan={3}>A rotina ainda não rodou no Núcleo.</td></tr>}
              {historico.map((h, i) => {
                const d = h.detalhe as Record<string, string | number>;
                return (
                  <tr key={i}>
                    <td className={s.data}>{dataHora(h.criado_em)}</td>
                    <td><span className={s.pill} style={tom(h.sucesso ? "#16a34a" : "#dc2626")}><i />{h.sucesso ? "OK" : "Falha"}</span></td>
                    <td className={s.dataSub}>
                      {d.erro ? String(d.erro)
                        : `${compBR(String(d.competencia ?? ""))} · elo ${d.elo} · ${d.transmitidas ?? 0} transmitidas, ${d.pulou ?? 0} já estavam, ${d.erros ?? 0} erros, ${d.restantes ?? 0} restantes`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
