"use client";

// Fiscal · Parcelamentos do Simples Nacional (PARCSN, PARCSN-ESP, PERTSN, RELPSN).
// A lista vem do controle no banco (grátis). Toda consulta à Receita é cobrada
// pelo SERPRO e só acontece por clique:
//   Consultar empresa -> 4 chamadas (uma por modalidade) e sincroniza o controle
//   Detalhe           -> 2 chamadas (parcelamento + parcelas a gerar)
//   Gerar DAS         -> 1 chamada por guia; o lote roda no navegador e sai em ZIP
// Layout padrão (PainelPadrao.module.css).

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { formatCNPJ } from "@/lib/conciliacao";
import { LISTA_MODALIDADES, MODALIDADES, compAtual, fmtComp, fmtDataInt, nomeArquivo, type Modalidade } from "@/lib/parcelamentos-regras";
import s from "./PainelPadrao.module.css";

interface Linha { id: number; cnpj: string; razao_social: string | null; modalidade: Modalidade; numero: number; situacao: string | null; atualizado_em: string }
interface Carteira { cnpj: string; nome: string | null; codigo: number }
interface Dados { linhas: Linha[]; carteira: Carteira[]; avisoCarteira: string | null }
interface Pagamento { mesDaParcela?: number; vencimentoDoDas?: number; dataDeArrecadacao?: number; valorPago?: number }
interface Detalhe {
  parcelamento: {
    situacao?: string; dataDoPedido?: number;
    consolidacaoOriginal?: { valorTotalConsolidado?: number; quantidadeParcelas?: number; parcelaBasica?: number; dataConsolidacao?: number };
    demonstrativoPagamentos?: Pagamento[];
  } | null;
  erroParcelamento: string | null;
  parcelas: { parcela: number; valor: number }[];
  erroParcelas: string | null;
}

const POR_PAGINA = 25;
const TOM: Record<Modalidade, string> = { "PARCSN": "#2563eb", "PARCSN-ESP": "#0891b2", "PERTSN": "#7c3aed", "RELPSN": "#d97706" };
const tom = (cor: string) => ({ "--tom": cor }) as CSSProperties;
const brl = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const iniciais = (n: string | null) => (n ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
const dataHora = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
/** "AAAA-MM" <-> AAAAMM */
const mesInput = (c: number) => `${String(c).slice(0, 4)}-${String(c).slice(4)}`;
const deMesInput = (v: string) => Number(v.replace("-", ""));

const Ico: Record<string, ReactNode> = {
  busca: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  guia: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M9 14h6M9 18h4" /></svg>,
  olho: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>,
  lixo: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>,
  consultar: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg>,
  zip: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>,
  moeda: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v10M15 9.5c0-1.4-1.3-2-3-2s-3 .8-3 2.2 1.3 1.8 3 2.3 3 .9 3 2.3-1.3 2.2-3 2.2-3-.7-3-2" /></svg>,
};

async function post<T>(corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch("/api/fiscal/parcelamentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as T;
}
const b64ParaBlob = (b64: string) => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: "application/pdf" });
const baixar = (blob: Blob, nome: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

export default function Parcelamentos() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Modalidade | "">("");
  const [pagina, setPagina] = useState(0);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [detalhe, setDetalhe] = useState<{ linha: Linha; d: Detalhe | null; carregando: boolean; erro: string | null } | null>(null);
  const [gerando, setGerando] = useState<string | null>(null);
  const [competencia, setCompetencia] = useState(compAtual());
  const [lote, setLote] = useState<{ feitos: number; total: number; atual: string; falhas: number } | null>(null);
  const parar = useRef(false);

  const carregar = useCallback(async () => {
    setErro(null);
    const r = await fetch("/api/fiscal/parcelamentos", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) { setErro(j.error); return; }
    setDados(j);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const linhas = useMemo(() => dados?.linhas ?? [], [dados]);
  const kpis = useMemo(() => ({
    empresas: new Set(linhas.map((l) => l.cnpj)).size,
    por: Object.fromEntries(LISTA_MODALIDADES.map((m) => [m, linhas.filter((l) => l.modalidade === m).length])) as Record<Modalidade, number>,
  }), [linhas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = q.replace(/\D/g, "");
    return linhas.filter((l) => {
      if (filtro && l.modalidade !== filtro) return false;
      if (!q) return true;
      return (l.razao_social ?? "").toLowerCase().includes(q) || (qd.length >= 3 && (l.cnpj.includes(qd) || String(l.numero).includes(qd)));
    });
  }, [linhas, busca, filtro]);
  useEffect(() => { setPagina(0); }, [busca, filtro]);
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const visiveis = filtradas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const todasMarcadas = filtradas.length > 0 && filtradas.every((l) => marcadas.has(l.id));

  async function abrirDetalhe(linha: Linha) {
    if (!confirm(`Consultar o parcelamento ${linha.modalidade} nº ${linha.numero} de ${linha.razao_social ?? formatCNPJ(linha.cnpj)}?\n\nSão 2 chamadas cobradas pelo SERPRO (parcelamento + parcelas a gerar).`)) return;
    setDetalhe({ linha, d: null, carregando: true, erro: null });
    try {
      const d = await post<Detalhe>({ acao: "detalhe", cnpj: linha.cnpj, modalidade: linha.modalidade, numero: linha.numero });
      setDetalhe({ linha, d, carregando: false, erro: null });
    } catch (e) {
      setDetalhe({ linha, d: null, carregando: false, erro: e instanceof Error ? e.message : "Falha na consulta." });
    }
  }

  async function gerarUma(linha: Linha, parcela: number) {
    if (!confirm(`Gerar o DAS da parcela ${fmtComp(parcela)} (${linha.modalidade}) de ${linha.razao_social ?? formatCNPJ(linha.cnpj)}?\n\nA chamada é cobrada pelo SERPRO.`)) return;
    const chave = `${linha.id}-${parcela}`;
    setGerando(chave);
    try {
      const { pdf } = await post<{ pdf: string }>({ acao: "gerar_das", cnpj: linha.cnpj, modalidade: linha.modalidade, parcela });
      baixar(b64ParaBlob(pdf), nomeArquivo(linha.razao_social, linha.cnpj, linha.modalidade, parcela, linha.numero));
      setMsg({ texto: `${linha.razao_social ?? formatCNPJ(linha.cnpj)}: DAS ${fmtComp(parcela)} gerado.`, ok: true });
    } catch (e) {
      setMsg({ texto: `${linha.razao_social ?? formatCNPJ(linha.cnpj)}: ${e instanceof Error ? e.message : "falha"}`, ok: false });
    } finally {
      setGerando(null);
    }
  }

  async function removerLinha(l: Linha) {
    if (!confirm(`Tirar do controle o parcelamento ${l.modalidade} nº ${l.numero} de ${l.razao_social ?? formatCNPJ(l.cnpj)}?\n\nNão altera nada na Receita; uma nova consulta da empresa traz de volta se ainda estiver ativo.`)) return;
    try { await post({ acao: "remover", id: l.id }); await carregar(); } catch (e) { setMsg({ texto: e instanceof Error ? e.message : "Falha.", ok: false }); }
  }

  /** Lote: um DAS por parcelamento para a competência, em ZIP, com CSV das falhas. */
  async function gerarLote(alvo: Linha[]) {
    if (!alvo.length) return;
    if (!confirm(`Gerar o DAS de ${fmtComp(competencia)} para ${alvo.length} parcelamento(s)?\n\nSão ${alvo.length} chamada(s) cobradas pelo SERPRO. O resultado sai num ZIP, com a lista do que falhou.`)) return;
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const falhas: string[][] = [];
    parar.current = false;
    setMsg(null);
    let feitos = 0;
    let seguidas = 0;
    for (const l of alvo) {
      if (parar.current) break;
      setLote({ feitos, total: alvo.length, atual: l.razao_social ?? formatCNPJ(l.cnpj), falhas: falhas.length });
      try {
        const { pdf } = await post<{ pdf: string }>({ acao: "gerar_das", cnpj: l.cnpj, modalidade: l.modalidade, parcela: competencia });
        zip.file(nomeArquivo(l.razao_social, l.cnpj, l.modalidade, competencia, l.numero), pdf, { base64: true });
        seguidas = 0;
      } catch (e) {
        falhas.push([l.razao_social ?? "", formatCNPJ(l.cnpj), l.modalidade, String(l.numero), e instanceof Error ? e.message : "falha"]);
        if (++seguidas >= 5) { falhas.push(["", "", "", "", "Lote interrompido: 5 falhas seguidas."]); break; }
      }
      feitos++;
    }
    if (falhas.length) {
      const csv = [["Empresa", "CNPJ", "Modalidade", "Número", "Motivo"], ...falhas]
        .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\r\n");
      zip.file(`_FALHAS_${competencia}.csv`, "﻿" + csv);
    }
    const ok = feitos - falhas.filter((f) => f[0] || f[1]).length;
    if (ok > 0 || falhas.length) baixar(await zip.generateAsync({ type: "blob" }), `DAS_Parcelamentos_${competencia}.zip`);
    setLote(null);
    setMsg({ texto: `Lote ${fmtComp(competencia)}: ${ok} DAS gerado(s)${falhas.length ? `, ${falhas.filter((f) => f[0] || f[1]).length} falha(s) (lista no ZIP)` : ""}${parar.current ? " · interrompido" : ""}.`, ok: falhas.length === 0 });
  }

  const kpi = (rot: string, valor: ReactNode, desc: string, cor: string, f: Modalidade | null = null) => (
    <button key={rot} type="button" className={`${s.kpi} ${f && filtro === f ? s.on : ""}`} style={{ ...tom(cor), cursor: f ? "pointer" : "default" }}
            onClick={() => f && setFiltro(filtro === f ? "" : f)}>
      <div className={s.kpiRotulo}>{rot}</div>
      <div className={s.kpiValor}>{valor}</div>
      <div className={s.kpiDesc}>{desc}</div>
    </button>
  );

  if (erro) return <div className={`${s.aviso} ${s.erro}`}><strong>Erro:</strong> {erro}</div>;
  if (!dados) return <div className={s.painel}><div className={s.vazio} style={{ padding: 40 }}>Carregando…</div></div>;

  const alvoLote = marcadas.size ? linhas.filter((l) => marcadas.has(l.id)) : filtradas;

  return (
    <div className={s.wrap}>
      <div className={s.kpis}>
        {kpi("Empresas", kpis.empresas, `${linhas.length} parcelamento(s) ativo(s)`, "#475569")}
        {LISTA_MODALIDADES.map((m) => kpi(MODALIDADES[m].rotulo, kpis.por[m], m, TOM[m], m))}
      </div>

      <ConsultarEmpresa carteira={dados.carteira} aviso={dados.avisoCarteira}
                        onFeito={async (texto, ok) => { setMsg({ texto, ok }); await carregar(); }} />

      {msg && (
        <div className={`${s.aviso} ${msg.ok ? s.info : s.erro}`}>
          <span>{msg.texto}</span>
          <button className={s.avisoFechar} onClick={() => setMsg(null)} aria-label="Fechar">×</button>
        </div>
      )}

      <div className={s.painel}>
        <div className={s.barra}>
          <label className={s.busca}>
            {Ico.busca}
            <input placeholder="Buscar por razão social, CNPJ ou número" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <select className={s.select} value={filtro} onChange={(e) => setFiltro(e.target.value as Modalidade | "")}>
            <option value="">Todas as modalidades</option>
            {LISTA_MODALIDADES.map((m) => <option key={m} value={m}>{MODALIDADES[m].rotulo}</option>)}
          </select>
          <span className={s.espaco} />
          <label className={s.campo} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <span className={s.campoRotulo}>Competência</span>
            <input type="month" className={s.select} value={mesInput(competencia)} onChange={(e) => e.target.value && setCompetencia(deMesInput(e.target.value))} />
          </label>
          <button className={`${s.botao} ${s.primario}`} disabled={!!lote || !alvoLote.length} onClick={() => gerarLote(alvoLote)}>
            {Ico.zip} Gerar DAS em lote ({alvoLote.length})
          </button>
        </div>

        {lote ? (
          <div className={s.selecao}>
            <strong>Gerando {lote.feitos + 1} de {lote.total}</strong>
            <span className={s.progresso}><span style={{ width: `${(lote.feitos / lote.total) * 100}%` }} /></span>
            <span className={s.custo}>{lote.atual} · {lote.falhas} falha(s)</span>
            <button className={`${s.botao} ${s.perigo}`} onClick={() => { parar.current = true; }}>Parar</button>
          </div>
        ) : (
          <div className={s.selecao}>
            {marcadas.size > 0 && <><strong>{marcadas.size} selecionado(s)</strong><button className={s.botao} onClick={() => setMarcadas(new Set())}>Limpar</button></>}
            <span className={s.custo}>{Ico.moeda} cada DAS gerado é uma chamada cobrada pelo SERPRO · sem seleção, o lote usa a lista filtrada</span>
          </div>
        )}

        <div className={s.tabelaWrap}>
          <table className={s.tabela}>
            <thead>
              <tr>
                <th className={s.colCheck}>
                  <input type="checkbox" checked={todasMarcadas} aria-label="Selecionar todos"
                         onChange={() => setMarcadas(todasMarcadas ? new Set() : new Set(filtradas.map((l) => l.id)))} />
                </th>
                <th>Empresa</th>
                <th>Modalidade</th>
                <th>Nº do pedido</th>
                <th>Situação</th>
                <th>Atualizado em</th>
                <th className={s.colAcoes}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 && (
                <tr><td className={s.vazio} colSpan={7}>{linhas.length ? "Nenhum parcelamento com esses filtros." : "Nenhum parcelamento no controle. Consulte uma empresa acima."}</td></tr>
              )}
              {visiveis.map((l) => (
                <tr key={l.id}>
                  <td className={s.colCheck}>
                    <input type="checkbox" checked={marcadas.has(l.id)} aria-label="Selecionar"
                           onChange={() => setMarcadas((m) => { const n = new Set(m); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })} />
                  </td>
                  <td>
                    <div className={s.empresa}>
                      <span className={s.avatar}>{iniciais(l.razao_social)}</span>
                      <div>
                        <div className={s.empresaNome}>{l.razao_social ?? "—"}</div>
                        <div className={s.empresaSub}>{formatCNPJ(l.cnpj)}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className={s.pill} style={tom(TOM[l.modalidade])}><i />{MODALIDADES[l.modalidade].rotulo}</span></td>
                  <td className={s.data}>{l.numero}</td>
                  <td>{l.situacao ?? "—"}</td>
                  <td className={s.data}>{dataHora(l.atualizado_em)}</td>
                  <td className={s.colAcoes}>
                    <div className={s.acoes}>
                      <button className={s.icone} title="Detalhe e parcelas — 2 chamadas cobradas" onClick={() => abrirDetalhe(l)}>{Ico.olho}</button>
                      <button className={s.icone} disabled={!!gerando || !!lote} title={`Gerar DAS de ${fmtComp(competencia)} — cobrado`}
                              onClick={() => gerarUma(l, competencia)}>{gerando === `${l.id}-${competencia}` ? "…" : Ico.guia}</button>
                      <button className={s.icone} title="Tirar do controle (não mexe na Receita)" onClick={() => removerLinha(l)}>{Ico.lixo}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={s.rodape}>
          <span>
            {filtradas.length ? `${pagina * POR_PAGINA + 1}–${Math.min((pagina + 1) * POR_PAGINA, filtradas.length)} de ` : ""}
            {filtradas.length.toLocaleString("pt-BR")} parcelamento(s)
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
          <aside className={s.lateral} role="dialog" aria-label="Detalhe do parcelamento">
            <div className={s.lateralTopo}>
              <span className={s.avatar}>{iniciais(detalhe.linha.razao_social)}</span>
              <div style={{ flex: 1 }}>
                <h3>{detalhe.linha.razao_social ?? "—"}</h3>
                <div className={s.empresaSub}>{formatCNPJ(detalhe.linha.cnpj)} · {MODALIDADES[detalhe.linha.modalidade].rotulo} nº {detalhe.linha.numero}</div>
              </div>
              <button className={s.avisoFechar} onClick={() => setDetalhe(null)} aria-label="Fechar">×</button>
            </div>
            <div className={s.lateralCorpo}>
              {detalhe.carregando && <div className={s.vazio}>Consultando a Receita…</div>}
              {detalhe.erro && <div className={`${s.aviso} ${s.erro}`}>{detalhe.erro}</div>}
              {detalhe.d && <DetalheCorpo d={detalhe.d} gerando={gerando} onGerar={(p) => gerarUma(detalhe.linha, p)} prefixo={`${detalhe.linha.id}-`} />}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function DetalheCorpo({ d, gerando, onGerar, prefixo }: { d: Detalhe; gerando: string | null; onGerar: (p: number) => void; prefixo: string }) {
  const c = d.parcelamento?.consolidacaoOriginal;
  const pagos = d.parcelamento?.demonstrativoPagamentos ?? [];
  const atual = compAtual();
  return (
    <>
      {d.erroParcelamento ? <div className={`${s.aviso} ${s.erro}`}>Parcelamento: {d.erroParcelamento}</div> : (
        <div className={s.grade2}>
          <div className={s.campo}><span className={s.campoRotulo}>Situação</span><span className={s.campoValor}>{d.parcelamento?.situacao ?? "—"}</span></div>
          <div className={s.campo}><span className={s.campoRotulo}>Data do pedido</span><span className={s.campoValor}>{fmtDataInt(d.parcelamento?.dataDoPedido)}</span></div>
          {c ? <>
            <div className={s.campo}><span className={s.campoRotulo}>Total consolidado</span><span className={s.campoValor}>{brl(c.valorTotalConsolidado)}</span></div>
            <div className={s.campo}><span className={s.campoRotulo}>Parcelas</span><span className={s.campoValor}>{c.quantidadeParcelas ?? "—"} × {brl(c.parcelaBasica)}</span></div>
            <div className={s.campo}><span className={s.campoRotulo}>Consolidado em</span><span className={s.campoValor}>{fmtDataInt(c.dataConsolidacao)}</span></div>
            <div className={s.campo}><span className={s.campoRotulo}>Pagas</span><span className={s.campoValor}>{pagos.length}{c.quantidadeParcelas ? ` de ${c.quantidadeParcelas}` : ""}</span></div>
          </> : <div className={s.campo}><span className={s.campoRotulo}>Consolidação</span><span className={s.campoValor}>sem consolidação disponível</span></div>}
        </div>
      )}

      <div className={s.campo}>
        <span className={s.campoRotulo}>Parcelas para gerar</span>
        {d.erroParcelas && <div className={`${s.aviso} ${s.erro}`}>{d.erroParcelas}</div>}
        {!d.erroParcelas && !d.parcelas.length && <span className={s.dataSub}>Nenhuma parcela a emitir agora (mês já pago?).</span>}
        {d.parcelas.length > 0 && (
          <table className={s.tabela}>
            <thead><tr><th>Parcela</th><th style={{ textAlign: "right" }}>Valor</th><th className={s.colAcoes}>DAS</th></tr></thead>
            <tbody>
              {d.parcelas.map((p) => (
                <tr key={p.parcela}>
                  <td className={s.data}>{fmtComp(p.parcela)} {p.parcela < atual && <span className={s.pill} style={tom("#dc2626")}><i />em atraso</span>}</td>
                  <td style={{ textAlign: "right" }} className={s.data}>{brl(p.valor)}</td>
                  <td className={s.colAcoes}>
                    <button className={s.icone} disabled={!!gerando} title="Gerar DAS — cobrado" onClick={() => onGerar(p.parcela)}>
                      {gerando === `${prefixo}${p.parcela}` ? "…" : Ico.guia}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pagos.length > 0 && (
        <div className={s.campo}>
          <span className={s.campoRotulo}>Pagamentos realizados</span>
          <table className={s.tabela}>
            <thead><tr><th>Parcela</th><th>Vencimento</th><th>Pago em</th><th style={{ textAlign: "right" }}>Valor</th></tr></thead>
            <tbody>
              {[...pagos].reverse().map((p, i) => (
                <tr key={i}>
                  <td className={s.data}>{p.mesDaParcela ? fmtComp(p.mesDaParcela) : "—"}</td>
                  <td className={s.data}>{fmtDataInt(p.vencimentoDoDas)}</td>
                  <td className={s.data}>{fmtDataInt(p.dataDeArrecadacao)}</td>
                  <td style={{ textAlign: "right" }} className={s.data}>{brl(p.valorPago)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Consulta as 4 modalidades de uma empresa (4 chamadas pagas) e sincroniza o controle. */
function ConsultarEmpresa({ carteira, aviso, onFeito }: { carteira: Carteira[]; aviso: string | null; onFeito: (texto: string, ok: boolean) => Promise<void> }) {
  const [texto, setTexto] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [rodando, setRodando] = useState(false);
  const nome = carteira.find((c) => c.cnpj === cnpj)?.nome ?? null;

  async function consultar() {
    if (!confirm(`Consultar os parcelamentos de ${nome ?? formatCNPJ(cnpj)} nas 4 modalidades?\n\nSão 4 chamadas cobradas pelo SERPRO.`)) return;
    setRodando(true);
    try {
      const r = await post<{ ativos: { modalidade: Modalidade; numero: number }[]; removidos: number; aviso: string | null }>(
        { acao: "pedidos", cnpj, razao_social: nome });
      const quem = nome ?? formatCNPJ(cnpj);
      const partes = [r.ativos.length
        ? `${quem}: ${r.ativos.length} parcelamento(s) ativo(s) — ${r.ativos.map((a) => `${a.modalidade} nº ${a.numero}`).join(", ")}.`
        : `${quem}: nenhum parcelamento ativo.`];
      if (r.removidos) partes.push(`${r.removidos} encerrado(s) saíram do controle.`);
      if (r.aviso) partes.push(r.aviso);
      await onFeito(partes.join(" "), !r.aviso);
    } catch (e) {
      await onFeito(`${nome ?? formatCNPJ(cnpj)}: ${e instanceof Error ? e.message : "falha"}`, false);
    } finally {
      setRodando(false);
    }
  }

  return (
    <div className={s.painel}>
      <div className={s.barra}>
        <label className={s.campo} style={{ flex: 1, minWidth: 260 }}>
          <span className={s.campoRotulo}>Consultar empresa na Receita</span>
          <input className={s.select} list="parc-carteira" value={texto} placeholder="Digite o nome, código ou CNPJ"
                 onChange={(e) => {
                   setTexto(e.target.value);
                   const dig = e.target.value.replace(/\D/g, "");
                   const achou = carteira.find((c) => e.target.value === `${c.nome ?? ""} — ${formatCNPJ(c.cnpj)}`);
                   setCnpj(achou ? achou.cnpj : dig.length === 14 || dig.length === 11 ? dig : "");
                 }} />
          <datalist id="parc-carteira">
            {carteira.map((c) => <option key={c.cnpj} value={`${c.nome ?? ""} — ${formatCNPJ(c.cnpj)}`}>{`cód. ${c.codigo}`}</option>)}
          </datalist>
        </label>
        <button className={`${s.botao} ${s.primario}`} disabled={!cnpj || rodando} onClick={consultar} style={{ alignSelf: "flex-end" }}>
          {Ico.consultar} {rodando ? "Consultando…" : "Consultar parcelamentos"}
        </button>
      </div>
      <div className={s.selecao}>
        <span className={s.custo}>{Ico.moeda} 4 chamadas cobradas (PARCSN, PARCSN-ESP, PERT-SN, RELP-SN) · ativos entram no controle, encerrados saem</span>
        {aviso && <span className={s.dataSub}>{aviso}</span>}
      </div>
    </div>
  );
}
