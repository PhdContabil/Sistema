"use client";

// Recálculos (Fiscal + Trabalhista). Guia atualizada para uma data de
// pagamento via Integra Contador — cada geração é cobrada pelo SERPRO.
// Sem histórico: a guia abre direto numa nova aba.
//   1. Débitos em aberto     -> lidos da última Situação Fiscal (grátis)
//   2. Por competência       -> DAS, DAS-MEI ou DCTFWeb a partir da declaração
//   3. Manual (SICALC)       -> DARF por código de receita
// Layout padrão (PainelPadrao.module.css).

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { formatCNPJ } from "@/lib/conciliacao";
import { ROTULO_SERVICO, type Debito, type Servico } from "@/lib/recalculo-regras";
import s from "./PainelPadrao.module.css";

interface Empresa { cnpj: string; razao_social: string | null; consultado_em: string | null; debitos: Debito[] }
interface Carteira { cnpj: string; nome: string | null; codigo: number }
interface Dados { empresas: Empresa[]; semLeitura: number; carteira: Carteira[]; avisoCarteira: string | null; consultas: Record<string, string> }
interface Pedido {
  servico: Servico; periodo: string; dataPagamento: string;
  codigo?: string; extensao?: string; vencimento?: string; valor?: number; observacao?: string;
}

const POR_PAGINA = 25;
const TOM: Record<Servico, string> = { das: "#2563eb", das_mei: "#0891b2", dctfweb: "#7c3aed", sicalc: "#d97706", sem_guia: "#64748b" };
const tom = (cor: string) => ({ "--tom": cor }) as CSSProperties;
const brl = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const dataBR = (iso: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};
const hojeIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const iniciais = (n: string | null) => (n ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
/** "AAAA-MM" (input month) -> "MM/AAAA" */
const mesBR = (v: string) => (v ? `${v.slice(5, 7)}/${v.slice(0, 4)}` : "");

/** Idade da última Situação Fiscal: verde até 7 dias, laranja até 30, vermelho depois. */
function UltimaConsulta({ iso, compacta = false }: { iso: string | null | undefined; compacta?: boolean }) {
  if (!iso) return <span className={s.pill} style={tom("#64748b")} title="Nenhuma Situação Fiscal consultada"><i />nunca consultada</span>;
  const dias = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
  const cor = dias <= 7 ? "#16a34a" : dias <= 30 ? "#d97706" : "#dc2626";
  const quando = dias === 0 ? "hoje" : dias === 1 ? "ontem" : `há ${dias} dias`;
  const data = new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  return (
    <span className={s.pill} style={tom(cor)} title={`Última Situação Fiscal: ${data}`}>
      <i />{compacta ? quando : `consultada ${quando} (${data.slice(0, 10)})`}
    </span>
  );
}

/** Recarrega a tela depois de atualizar uma Situação Fiscal. */
const Recarregar = createContext<() => Promise<void>>(async () => {});

/** Botão que consulta uma nova Situação Fiscal da empresa (cobrado) e recarrega os débitos. */
function AtualizarSF({ cnpj, nome, compacto = false }: { cnpj: string; nome?: string | null; compacto?: boolean }) {
  const recarregar = useContext(Recarregar);
  const [rodando, setRodando] = useState(false);
  async function atualizar() {
    if (!confirm(`Consultar nova Situação Fiscal de ${nome ?? formatCNPJ(cnpj)}?\n\nA chamada é cobrada pelo SERPRO e leva alguns segundos.`)) return;
    setRodando(true);
    try {
      const r = await fetch("/api/fiscal/recalculos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "atualizar_sf", cnpj, razao_social: nome ?? null }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { alert(`Situação Fiscal não atualizada: ${j.error ?? `HTTP ${r.status}`}`); return; }
      await recarregar();
    } finally {
      setRodando(false);
    }
  }
  return compacto ? (
    <button type="button" className={s.icone} disabled={rodando} onClick={atualizar}
            title="Atualizar Situação Fiscal agora (cobrado)">{rodando ? "…" : Ico.atualizar}</button>
  ) : (
    <button type="button" className={s.botao} disabled={rodando} onClick={atualizar} title="Cobrado pelo SERPRO">
      {rodando ? "Consultando…" : "Atualizar Situação Fiscal"}
    </button>
  );
}

const Ico: Record<string, ReactNode> = {
  atualizar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg>,
  busca: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  guia: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M9 14h6M9 18h4" /></svg>,
  editar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>,
  moeda: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v10M15 9.5c0-1.4-1.3-2-3-2s-3 .8-3 2.2 1.3 1.8 3 2.3 3 .9 3 2.3-1.3 2.2-3 2.2-3-.7-3-2" /></svg>,
};

/** Chama a API; abre o PDF numa aba já aberta (evita bloqueio de pop-up). */
async function gerar(cnpj: string, pedido: Pedido): Promise<string | null> {
  const aba = window.open("", "_blank");
  const r = await fetch("/api/fiscal/recalculos", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cnpj, pedido }),
  });
  if (!r.ok) {
    aba?.close();
    const j = await r.json().catch(() => ({}));
    return j.error ?? "Não foi possível gerar a guia.";
  }
  const url = URL.createObjectURL(await r.blob());
  if (aba) aba.location.href = url; else window.open(url, "_blank");
  return null;
}

type Aba = "abertos" | "competencia" | "manual";

export default function Recalculos() {
  const [aba, setAba] = useState<Aba>("abertos");
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [manualInicial, setManualInicial] = useState<{ cnpj: string; d: Debito } | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    const r = await fetch("/api/fiscal/recalculos", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) { setErro(j.error); return; }
    setDados(j);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const abas: [Aba, string][] = [["abertos", "Débitos em aberto"], ["competencia", "Por competência"], ["manual", "Manual (SICALC)"]];

  return (
    <Recarregar.Provider value={carregar}>
    <div className={s.wrap}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {abas.map(([k, rot]) => (
          <button key={k} type="button" className={`${s.toggle} ${aba === k ? s.on : ""}`} onClick={() => setAba(k)}>{rot}</button>
        ))}
      </div>
      {erro && <div className={`${s.aviso} ${s.erro}`}><strong>Erro:</strong> {erro}</div>}
      {!dados && !erro && <div className={s.painel}><div className={s.vazio} style={{ padding: 40 }}>Carregando…</div></div>}
      {dados && aba === "abertos" && (
        <Abertos dados={dados} onManual={(cnpj, d) => { setManualInicial({ cnpj, d }); setAba("manual"); }} />
      )}
      {dados && aba === "competencia" && <PorCompetencia carteira={dados.carteira} avisoCarteira={dados.avisoCarteira} consultas={dados.consultas} />}
      {dados && aba === "manual" && <Manual carteira={dados.carteira} avisoCarteira={dados.avisoCarteira} inicial={manualInicial} consultas={dados.consultas} />}
    </div>
    </Recarregar.Provider>
  );
}

/* ---------- 1. Débitos em aberto ---------- */

function Abertos({ dados, onManual }: { dados: Dados; onManual: (cnpj: string, d: Debito) => void }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Servico | "">("");
  const [antigas, setAntigas] = useState(false);
  const [dataPgto, setDataPgto] = useState(hojeIso());
  const [pagina, setPagina] = useState(0);
  const [gerando, setGerando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const linhas = useMemo(() => dados.empresas.flatMap((e) =>
    e.debitos.map((d, i) => ({ key: `${e.cnpj}-${i}`, e, d }))), [dados]);

  const kpis = useMemo(() => {
    const por = (sv: Servico) => linhas.filter((l) => l.d.servico === sv);
    const soma = (ls: typeof linhas) => ls.reduce((t, l) => t + (l.d.saldo_consolidado || 0), 0);
    return {
      empresas: dados.empresas.length, debitos: linhas.length, total: soma(linhas),
      das: por("das").length + por("das_mei").length, dctf: por("dctfweb").length, darf: por("sicalc").length,
    };
  }, [linhas, dados]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = q.replace(/\D/g, "");
    return linhas.filter(({ e, d }) => {
      if (antigas && e.consultado_em && Date.now() - Date.parse(e.consultado_em) <= 30 * 86_400_000) return false;
      if (filtro && (filtro === "das" ? !["das", "das_mei"].includes(d.servico) : d.servico !== filtro)) return false;
      if (!q) return true;
      return (e.razao_social ?? "").toLowerCase().includes(q) || (qd.length >= 3 && e.cnpj.includes(qd)) || d.receita.toLowerCase().includes(q);
    });
  }, [linhas, busca, filtro, antigas]);
  useEffect(() => { setPagina(0); }, [busca, filtro, antigas]);

  // Modo de visualização: tabela (uma linha por débito) ou matriz (empresa > guia > débitos).
  const [modo, setModo] = useState<"tabela" | "matriz">("tabela");
  useEffect(() => { try { if (localStorage.getItem("recalc-modo") === "matriz") setModo("matriz"); } catch { /* sem storage */ } }, []);
  const trocarModo = (m: "tabela" | "matriz") => { setModo(m); try { localStorage.setItem("recalc-modo", m); } catch { /* sem storage */ } };
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const alternar = (k: string) => setAbertos((a) => { const n = new Set(a); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const matriz = useMemo(() => {
    const porEmpresa = new Map<string, { e: Empresa; itens: typeof filtradas }>();
    for (const l of filtradas) {
      const g = porEmpresa.get(l.e.cnpj) ?? { e: l.e, itens: [] };
      g.itens.push(l);
      porEmpresa.set(l.e.cnpj, g);
    }
    const soma = (ls: typeof filtradas, f: (d: Debito) => number) => ls.reduce((t, l) => t + (f(l.d) || 0), 0);
    return [...porEmpresa.values()].map(({ e, itens }) => {
      const porServico = new Map<Servico, typeof filtradas>();
      for (const l of itens) porServico.set(l.d.servico, [...(porServico.get(l.d.servico) ?? []), l]);
      return {
        e, qtd: itens.length, principal: soma(itens, (d) => d.saldo_devedor), total: soma(itens, (d) => d.saldo_consolidado),
        guias: [...porServico.entries()].map(([servico, ls]) => ({
          servico, itens: ls, principal: soma(ls, (d) => d.saldo_devedor), total: soma(ls, (d) => d.saldo_consolidado),
        })),
      };
    });
  }, [filtradas]);

  const acoesDebito = (key: string, e: Empresa, d: Debito) => (
    <div className={s.acoes}>
      <button className={s.icone} disabled={d.servico === "sem_guia" || gerando !== null}
              title={d.servico === "sem_guia" ? "Multa lançada: a guia sai pela notificação no e-CAC" : "Gerar guia atualizada — cobrado"}
              onClick={() => { setDataPgto(hojeIso()); setPedindo({ key, e, d }); }}>{gerando === key ? "…" : Ico.guia}</button>
      {d.servico === "sicalc" && (
        <button className={s.icone} title="Ajustar no recálculo manual" onClick={() => onManual(e.cnpj, d)}>{Ico.editar}</button>
      )}
    </div>
  );

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const visiveis = filtradas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  const [pedindo, setPedindo] = useState<{ key: string; e: Empresa; d: Debito } | null>(null);

  async function gerarDebito(key: string, e: Empresa, d: Debito) {
    const nome = e.razao_social ?? formatCNPJ(e.cnpj);
    setPedindo(null);
    setGerando(key);
    setMsg(null);
    try {
      const pedido: Pedido = d.servico === "sicalc"
        ? { servico: "sicalc", periodo: d.periodo, dataPagamento: dataPgto, codigo: d.codigo ?? "", extensao: d.extensao ?? "",
            vencimento: d.vencimento, valor: d.saldo_devedor }
        : { servico: d.servico, periodo: d.periodo, dataPagamento: dataPgto };
      const falha = await gerar(e.cnpj, pedido);
      setMsg(falha ? { texto: `${nome}: ${falha}`, ok: false } : { texto: `${nome}: guia gerada.`, ok: true });
    } finally {
      setGerando(null);
    }
  }

  const kpi = (rot: string, valor: ReactNode, desc: string, cor: string, f: Servico | "" | null = null) => (
    <button type="button" className={`${s.kpi} ${f !== null && filtro === f && f !== "" ? s.on : ""}`} style={{ ...tom(cor), cursor: f === null ? "default" : "pointer" }}
            onClick={() => f !== null && setFiltro(filtro === f ? "" : f)}>
      <div className={s.kpiRotulo}>{rot}</div>
      <div className={s.kpiValor}>{valor}</div>
      <div className={s.kpiDesc}>{desc}</div>
    </button>
  );

  return (
    <>
      <div className={s.kpis}>
        {kpi("Empresas com débito", kpis.empresas, `${kpis.debitos} débito(s) exigível(is)`, "#475569")}
        {kpi("Total consolidado", <span style={{ fontSize: 20 }}>{brl(kpis.total)}</span>, "com multa e juros da data do relatório", "#dc2626")}
        {kpi("DAS", kpis.das, "Simples Nacional e MEI", TOM.das, "das")}
        {kpi("DCTFWeb", kpis.dctf, "contribuições previdenciárias", TOM.dctfweb, "dctfweb")}
        {kpi("DARF (SICALC)", kpis.darf, "demais tributos federais", TOM.sicalc, "sicalc")}
      </div>

      <div className={s.aviso}>
        Lista tirada da última <strong>Situação Fiscal</strong> de cada empresa: o que venceu depois dela não aparece aqui.
        Para um vencimento recente use <strong>Por competência</strong>.
        {dados.semLeitura > 0 && <> {dados.semLeitura} relatório(s) ainda não lidos: rode “Reclassificar” na Situação Fiscal.</>}
      </div>

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
            <input placeholder="Buscar por razão social, CNPJ ou tributo" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <select className={s.select} value={filtro} onChange={(e) => setFiltro(e.target.value as Servico | "")}>
            <option value="">Todos os tipos</option>
            <option value="das">DAS / DAS-MEI</option>
            <option value="dctfweb">DCTFWeb</option>
            <option value="sicalc">DARF (SICALC)</option>
            <option value="sem_guia">Multas lançadas (sem guia aqui)</option>
          </select>
          <label className={s.check} title="Débitos cujo relatório pode estar desatualizado">
            <input type="checkbox" checked={antigas} onChange={(e) => setAntigas(e.target.checked)} /> relatório com mais de 30 dias
          </label>
          <span className={s.espaco} />
          <div style={{ display: "flex", gap: 4 }} role="group" aria-label="Visualização">
            <button type="button" className={`${s.toggle} ${modo === "tabela" ? s.on : ""}`} onClick={() => trocarModo("tabela")}>Tabela</button>
            <button type="button" className={`${s.toggle} ${modo === "matriz" ? s.on : ""}`} onClick={() => trocarModo("matriz")}>Matriz</button>
          </div>
        </div>
        {pedindo && (
          <div role="dialog" aria-modal="true" onClick={() => setPedindo(null)}
               style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
            <form onClick={(ev) => ev.stopPropagation()}
                  onSubmit={(ev) => { ev.preventDefault(); if (dataPgto) gerarDebito(pedindo.key, pedindo.e, pedindo.d); }}
                  style={{ background: "var(--surface, #fff)", color: "inherit", borderRadius: 12, padding: 20, width: "min(420px, 100%)", boxShadow: "0 20px 50px rgba(0,0,0,.25)", display: "flex", flexDirection: "column", gap: 12 }}>
              <strong style={{ fontSize: 16 }}>Gerar {ROTULO_SERVICO[pedindo.d.servico]}</strong>
              <div className={s.dataSub}>
                {pedindo.e.razao_social ?? formatCNPJ(pedindo.e.cnpj)}<br />
                {pedindo.d.receita} · {pedindo.d.periodo}
              </div>
              <label className={s.campo}>
                <span className={s.campoRotulo}>Data de pagamento</span>
                <input type="date" className={s.select} autoFocus required value={dataPgto} min={hojeIso()} onChange={(ev) => setDataPgto(ev.target.value)} />
              </label>
              <span className={s.custo}>{Ico.moeda} cobrado pelo SERPRO{pedindo.d.servico === "dctfweb" ? " · DCTFWeb: data no mês corrente" : ""}</span>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className={s.botao} onClick={() => setPedindo(null)}>Cancelar</button>
                <button type="submit" className={s.botao} style={{ background: "#2563eb", color: "#fff", borderColor: "#2563eb" }}>Gerar guia</button>
              </div>
            </form>
          </div>
        )}
        <div className={s.selecao}>
          <span className={s.custo}>{Ico.moeda} cada guia gerada é cobrada pelo SERPRO · DCTFWeb só aceita data no mês corrente</span>
        </div>

        {modo === "matriz" && (
          <div className={s.tabelaWrap}>
            <table className={s.tabela}>
              <thead>
                <tr>
                  <th>Empresa / guia / débito</th>
                  <th>Situação Fiscal</th>
                  <th>Vencimento</th>
                  <th style={{ textAlign: "right" }}>Principal</th>
                  <th style={{ textAlign: "right" }}>Consolidado*</th>
                  <th className={s.colAcoes}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {matriz.length === 0 && (
                  <tr><td className={s.vazio} colSpan={6}>{linhas.length ? "Nenhum débito com esses filtros." : "Nenhum débito exigível nas Situações Fiscais consultadas."}</td></tr>
                )}
                {matriz.map((m) => {
                  const abE = abertos.has(m.e.cnpj);
                  return (
                    <Fragment key={m.e.cnpj}>
                      <tr style={{ cursor: "pointer" }} onClick={() => alternar(m.e.cnpj)}>
                        <td>
                          <div className={s.empresa}>
                            <span style={{ width: 18, fontWeight: 700 }}>{abE ? "−" : "+"}</span>
                            <span className={s.avatar}>{iniciais(m.e.razao_social)}</span>
                            <div>
                              <div className={s.empresaNome}>{m.e.razao_social ?? "—"}</div>
                              <div className={s.empresaSub}>{formatCNPJ(m.e.cnpj)} · {m.qtd} débito(s)</div>
                            </div>
                          </div>
                        </td>
                        <td onClick={(ev) => ev.stopPropagation()}>
                          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <UltimaConsulta iso={m.e.consultado_em} compacta />
                            <AtualizarSF cnpj={m.e.cnpj} nome={m.e.razao_social} compacto />
                          </span>
                        </td>
                        <td />
                        <td style={{ textAlign: "right" }} className={s.data}>{brl(m.principal)}</td>
                        <td style={{ textAlign: "right" }} className={s.data}><strong>{brl(m.total)}</strong></td>
                        <td />
                      </tr>
                      {abE && m.guias.map((g) => {
                        const kg = `${m.e.cnpj}|${g.servico}`;
                        const abG = abertos.has(kg);
                        return (
                          <Fragment key={kg}>
                            <tr style={{ cursor: "pointer" }} onClick={() => alternar(kg)}>
                              <td style={{ paddingLeft: 44 }}>
                                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                                  <span style={{ width: 14, fontWeight: 700 }}>{abG ? "−" : "+"}</span>
                                  <span className={s.pill} style={tom(TOM[g.servico])}><i />{ROTULO_SERVICO[g.servico]}</span>
                                  <span className={s.dataSub}>{g.itens.length} débito(s)</span>
                                </span>
                              </td>
                              <td /><td />
                              <td style={{ textAlign: "right" }} className={s.data}>{brl(g.principal)}</td>
                              <td style={{ textAlign: "right" }} className={s.data}>{brl(g.total)}</td>
                              <td />
                            </tr>
                            {abG && g.itens.map(({ key, d }) => (
                              <tr key={key}>
                                <td style={{ paddingLeft: 88 }}>
                                  <div>{d.receita} · <span className={s.data}>{d.periodo}</span></div>
                                  {d.situacao && <div className={s.dataSub}>{d.situacao.toLowerCase()}</div>}
                                </td>
                                <td />
                                <td className={s.data}>{dataBR(d.vencimento)}</td>
                                <td style={{ textAlign: "right" }} className={s.data}>{brl(d.saldo_devedor)}</td>
                                <td style={{ textAlign: "right" }} className={s.data}>{brl(d.saldo_consolidado)}</td>
                                <td className={s.colAcoes}>{acoesDebito(key, m.e, d)}</td>
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {modo === "matriz" && (
          <div className={s.rodape}>
            <span>{matriz.length} empresa(s) · {filtradas.length.toLocaleString("pt-BR")} débito(s) · *valor na data do relatório</span>
            <div className={s.paginas}>
              <button className={s.botao} onClick={() => setAbertos(new Set(matriz.flatMap((m) => [m.e.cnpj, ...m.guias.map((g) => `${m.e.cnpj}|${g.servico}`)])))}>Expandir tudo</button>
              <button className={s.botao} onClick={() => setAbertos(new Set())}>Recolher tudo</button>
            </div>
          </div>
        )}

        {modo === "tabela" && <>
        <div className={s.tabelaWrap}>
          <table className={s.tabela}>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Situação Fiscal</th>
                <th>Tributo</th>
                <th>Período</th>
                <th>Vencimento</th>
                <th style={{ textAlign: "right" }}>Principal</th>
                <th style={{ textAlign: "right" }}>Consolidado*</th>
                <th>Guia</th>
                <th className={s.colAcoes}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 && (
                <tr><td className={s.vazio} colSpan={9}>{linhas.length ? "Nenhum débito com esses filtros." : "Nenhum débito exigível nas Situações Fiscais consultadas."}</td></tr>
              )}
              {visiveis.map(({ key, e, d }) => (
                <tr key={key}>
                  <td>
                    <div className={s.empresa}>
                      <span className={s.avatar}>{iniciais(e.razao_social)}</span>
                      <div>
                        <div className={s.empresaNome}>{e.razao_social ?? "—"}</div>
                        <div className={s.empresaSub}>{formatCNPJ(e.cnpj)}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <UltimaConsulta iso={e.consultado_em} compacta />
                      <AtualizarSF cnpj={e.cnpj} nome={e.razao_social} compacto />
                    </span>
                  </td>
                  <td>
                    <div>{d.receita}</div>
                    {d.situacao && <div className={s.dataSub}>{d.situacao.toLowerCase()}</div>}
                  </td>
                  <td className={s.data}>{d.periodo}</td>
                  <td className={s.data}>{dataBR(d.vencimento)}</td>
                  <td style={{ textAlign: "right" }} className={s.data}>{brl(d.saldo_devedor)}</td>
                  <td style={{ textAlign: "right" }} className={s.data}>{brl(d.saldo_consolidado)}</td>
                  <td><span className={s.pill} style={tom(TOM[d.servico])}><i />{ROTULO_SERVICO[d.servico]}</span></td>
                  <td className={s.colAcoes}>{acoesDebito(key, e, d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={s.rodape}>
          <span>
            {filtradas.length ? `${pagina * POR_PAGINA + 1}–${Math.min((pagina + 1) * POR_PAGINA, filtradas.length)} de ` : ""}
            {filtradas.length.toLocaleString("pt-BR")} débito(s) · *valor na data do relatório; a guia sai com o valor da data de pagamento
          </span>
          <div className={s.paginas}>
            <button className={s.botao} disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>‹ Anterior</button>
            <span>{pagina + 1} / {totalPaginas}</span>
            <button className={s.botao} disabled={pagina >= totalPaginas - 1} onClick={() => setPagina((p) => p + 1)}>Próxima ›</button>
          </div>
        </div>
        </>}
      </div>
    </>
  );
}

/* ---------- seletor de empresa (carteira Questor ou CNPJ digitado) ---------- */

function SeletorEmpresa({ carteira, valor, onChange, consultas }: { carteira: Carteira[]; valor: string; onChange: (cnpj: string) => void; consultas: Record<string, string> }) {
  const [texto, setTexto] = useState(() => {
    const c = carteira.find((x) => x.cnpj === valor);
    return c ? `${c.nome ?? ""} — ${formatCNPJ(c.cnpj)}` : valor ? formatCNPJ(valor) : "";
  });
  return (
    <label className={s.campo}>
      <span className={s.campoRotulo}>Empresa</span>
      <input className={s.select} list="recalc-carteira" value={texto} placeholder="Digite o nome, código ou CNPJ"
             onChange={(e) => {
               setTexto(e.target.value);
               const dig = e.target.value.replace(/\D/g, "");
               const achou = carteira.find((c) => e.target.value === `${c.nome ?? ""} — ${formatCNPJ(c.cnpj)}`);
               onChange(achou ? achou.cnpj : dig.length === 14 || dig.length === 11 ? dig : "");
             }} />
      {valor && (
        <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
          <UltimaConsulta iso={consultas[valor]} />
          <AtualizarSF cnpj={valor} nome={carteira.find((c) => c.cnpj === valor)?.nome} />
          <a className={s.dataSub} href="/m/fiscal/situacao-fiscal" target="_blank" rel="noreferrer">abrir Situação Fiscal ↗</a>
        </span>
      )}
      <datalist id="recalc-carteira">
        {carteira.map((c) => <option key={c.cnpj} value={`${c.nome ?? ""} — ${formatCNPJ(c.cnpj)}`}>{`cód. ${c.codigo}`}</option>)}
      </datalist>
    </label>
  );
}

function Resultado({ msg, onFechar }: { msg: { texto: string; ok: boolean } | null; onFechar: () => void }) {
  if (!msg) return null;
  return (
    <div className={`${s.aviso} ${msg.ok ? s.info : s.erro}`}>
      <span>{msg.texto}</span>
      <button className={s.avisoFechar} onClick={onFechar} aria-label="Fechar">×</button>
    </div>
  );
}

/* ---------- 2. Por competência ---------- */

function PorCompetencia({ carteira, avisoCarteira, consultas }: { carteira: Carteira[]; avisoCarteira: string | null; consultas: Record<string, string> }) {
  const anterior = () => {
    const [a, m] = hojeIso().split("-").map(Number);
    const d = new Date(a, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const [cnpj, setCnpj] = useState("");
  const [servico, setServico] = useState<Servico>("das");
  const [competencia, setCompetencia] = useState(anterior());
  const [dataPgto, setDataPgto] = useState(hojeIso());
  const [gerando, setGerando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  async function enviar() {
    if (!cnpj) { setMsg({ texto: "Escolha a empresa (ou digite o CNPJ completo).", ok: false }); return; }
    if (!confirm(`Gerar ${ROTULO_SERVICO[servico]} de ${formatCNPJ(cnpj)}, competência ${mesBR(competencia)}, pagamento em ${dataBR(dataPgto)}?\n\nA chamada é cobrada pelo SERPRO.`)) return;
    setGerando(true);
    setMsg(null);
    try {
      const falha = await gerar(cnpj, { servico, periodo: mesBR(competencia), dataPagamento: dataPgto });
      setMsg(falha ? { texto: falha, ok: false } : { texto: "Guia gerada.", ok: true });
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className={s.painel}>
      <div className={s.barra}><strong>Guia atualizada a partir da declaração</strong><span className={s.dataSub}>para quem esqueceu de pagar um vencimento recente</span></div>
      <div className={s.lateralCorpo} style={{ maxWidth: 760 }}>
        {avisoCarteira && <div className={s.aviso}>{avisoCarteira}</div>}
        <div className={s.grade2}>
          <SeletorEmpresa carteira={carteira} valor={cnpj} onChange={setCnpj} consultas={consultas} />
          <label className={s.campo}>
            <span className={s.campoRotulo}>Guia</span>
            <select className={s.select} value={servico} onChange={(e) => setServico(e.target.value as Servico)}>
              <option value="das">DAS — Simples Nacional (PGDAS-D)</option>
              <option value="das_mei">DAS-MEI (PGMEI)</option>
              <option value="dctfweb">DCTFWeb (contribuições)</option>
            </select>
          </label>
          <label className={s.campo}>
            <span className={s.campoRotulo}>Competência</span>
            <input type="month" className={s.select} value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </label>
          <label className={s.campo}>
            <span className={s.campoRotulo}>Data de pagamento</span>
            <input type="date" className={s.select} value={dataPgto} min={hojeIso()} onChange={(e) => setDataPgto(e.target.value)} />
          </label>
        </div>
        <div className={s.aviso}>
          A Receita calcula multa e juros até a data de pagamento a partir do que foi <strong>declarado</strong> na competência.
          Sem declaração transmitida não há guia. Na DCTFWeb a data precisa ser dia útil e no mês corrente.
        </div>
        <Resultado msg={msg} onFechar={() => setMsg(null)} />
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className={`${s.botao} ${s.primario}`} onClick={enviar} disabled={gerando}>{Ico.guia} {gerando ? "Gerando…" : "Gerar guia"}</button>
          <span className={s.custo}>{Ico.moeda} cobrado pelo SERPRO</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- 3. Manual (SICALC) ---------- */

function Manual({ carteira, avisoCarteira, inicial, consultas }: { carteira: Carteira[]; avisoCarteira: string | null; inicial: { cnpj: string; d: Debito } | null; consultas: Record<string, string> }) {
  const d = inicial?.d;
  const mesInicial = d && /^\d{2}\/\d{4}$/.test(d.periodo) ? `${d.periodo.slice(3)}-${d.periodo.slice(0, 2)}` : "";
  const [cnpj, setCnpj] = useState(inicial?.cnpj ?? "");
  const [codigo, setCodigo] = useState(d?.codigo && d.extensao ? `${d.codigo}-${d.extensao}` : "");
  const [trimestral, setTrimestral] = useState(d?.tipo_periodo === "TR");
  const [competencia, setCompetencia] = useState(mesInicial);
  const [trimestre, setTrimestre] = useState(() => {
    const t = d && /^(\d)\s*\D*TRIM\/(\d{4})$/i.exec(d.periodo);
    return t ? { n: t[1], ano: t[2] } : { n: "1", ano: hojeIso().slice(0, 4) };
  });
  const [vencimento, setVencimento] = useState(d?.vencimento ?? "");
  const [valor, setValor] = useState(d ? d.saldo_devedor.toFixed(2).replace(".", ",") : "");
  const [observacao, setObservacao] = useState("");
  const [dataPgto, setDataPgto] = useState(hojeIso());
  const [gerando, setGerando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  async function enviar() {
    const [cod, ext] = codigo.replace(/[^\d-]/g, "").split("-");
    const v = Number(valor.replace(/\./g, "").replace(",", "."));
    const periodo = trimestral ? `${trimestre.n}º TRIM/${trimestre.ano}` : mesBR(competencia);
    if (!cnpj) { setMsg({ texto: "Escolha a empresa (ou digite o CNPJ completo).", ok: false }); return; }
    if (!periodo) { setMsg({ texto: "Informe o período de apuração.", ok: false }); return; }
    if (!confirm(`Gerar DARF ${codigo} de ${formatCNPJ(cnpj)}\nPeríodo ${periodo} · principal ${brl(v)}\nPagamento em ${dataBR(dataPgto)}\n\nA chamada é cobrada pelo SERPRO.`)) return;
    setGerando(true);
    setMsg(null);
    try {
      const falha = await gerar(cnpj, {
        servico: "sicalc", periodo, dataPagamento: dataPgto, codigo: cod, extensao: ext ?? "", vencimento, valor: v, observacao,
      });
      setMsg(falha ? { texto: falha, ok: false } : { texto: "DARF gerado.", ok: true });
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className={s.painel}>
      <div className={s.barra}><strong>DARF calculado pelo SICALC</strong><span className={s.dataSub}>para o que não sai de nenhuma declaração</span></div>
      <div className={s.lateralCorpo} style={{ maxWidth: 760 }}>
        {avisoCarteira && <div className={s.aviso}>{avisoCarteira}</div>}
        <div className={s.grade2}>
          <SeletorEmpresa key={inicial?.cnpj ?? "manual"} carteira={carteira} valor={cnpj} onChange={setCnpj} consultas={consultas} />
          <label className={s.campo}>
            <span className={s.campoRotulo}>Código de receita</span>
            <input className={s.select} value={codigo} placeholder="ex.: 8109-02" onChange={(e) => setCodigo(e.target.value)} />
          </label>
          <label className={s.campo}>
            <span className={s.campoRotulo}>
              Período de apuração{" "}
              <label style={{ fontWeight: 400, marginLeft: 8 }}>
                <input type="checkbox" checked={trimestral} onChange={(e) => setTrimestral(e.target.checked)} /> trimestral
              </label>
            </span>
            {trimestral ? (
              <span style={{ display: "flex", gap: 8 }}>
                <select className={s.select} value={trimestre.n} onChange={(e) => setTrimestre({ ...trimestre, n: e.target.value })}>
                  {["1", "2", "3", "4"].map((n) => <option key={n} value={n}>{n}º trimestre</option>)}
                </select>
                <input className={s.select} style={{ width: 90 }} value={trimestre.ano} onChange={(e) => setTrimestre({ ...trimestre, ano: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
              </span>
            ) : (
              <input type="month" className={s.select} value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
            )}
          </label>
          <label className={s.campo}>
            <span className={s.campoRotulo}>Vencimento original</span>
            <input type="date" className={s.select} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </label>
          <label className={s.campo}>
            <span className={s.campoRotulo}>Valor principal (R$)</span>
            <input className={s.select} inputMode="decimal" value={valor} placeholder="0,00" onChange={(e) => setValor(e.target.value)} />
          </label>
          <label className={s.campo}>
            <span className={s.campoRotulo}>Data de pagamento</span>
            <input type="date" className={s.select} value={dataPgto} min={hojeIso()} onChange={(e) => setDataPgto(e.target.value)} />
          </label>
          <label className={s.campo} style={{ gridColumn: "1 / -1" }}>
            <span className={s.campoRotulo}>Observação no DARF (opcional)</span>
            <input className={s.select} maxLength={100} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </label>
        </div>
        <div className={s.aviso}>
          Multa e juros são calculados pela Receita até a data de pagamento. Contribuições previdenciárias (CP-*) não saem
          pelo SICALC: use <strong>Por competência › DCTFWeb</strong>.
        </div>
        <Resultado msg={msg} onFechar={() => setMsg(null)} />
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className={`${s.botao} ${s.primario}`} onClick={enviar} disabled={gerando}>{Ico.guia} {gerando ? "Gerando…" : "Gerar DARF"}</button>
          <span className={s.custo}>{Ico.moeda} cobrado pelo SERPRO</span>
        </div>
      </div>
    </div>
  );
}
