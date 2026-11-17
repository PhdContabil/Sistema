"use client";

// Paralegal · Procurações. Abrir a tela NÃO consulta a Receita: lê o banco e
// a carteira do Questor. A consulta ao e-CAC (SERPRO) é por clique, uma
// empresa por requisição, num laço com progresso e botão parar.
// Layout: o mesmo padrão da Situação Fiscal (PainelPadrao.module.css).

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { formatCNPJ } from "@/lib/conciliacao";
import { DIAS_ALERTA, diasAte, vigencia, type ServicoProcuracao, type Vigencia } from "@/lib/procuracoes-calculo";
import s from "./PainelPadrao.module.css";

interface Linha {
  cnpj: string;
  razao_social: string | null;
  codigoempresa: number | null;
  ativa_questor: boolean;
  situacao: string | null;
  data_fim: string | null;
  servicos: ServicoProcuracao[] | null;
  mensagem: string | null;
  ultima_consulta: string | null;
}

const ROTULO: Record<Vigencia, string> = {
  em_dia: "Em dia",
  vencendo: `Vence em até ${DIAS_ALERTA} dias`,
  vencida: "Vencida",
  sem_procuracao: "Sem procuração",
  erro: "Erro na consulta",
  nunca: "Não consultada",
};
const TOM: Record<Vigencia, string> = {
  em_dia: "#16a34a", vencendo: "#d97706", vencida: "#dc2626",
  sem_procuracao: "#9333ea", erro: "#9333ea", nunca: "#64748b",
};
const ORDEM: Record<Vigencia, number> = { vencida: 0, vencendo: 1, sem_procuracao: 2, erro: 3, nunca: 4, em_dia: 5 };

const POR_PAGINA = 50;

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hoje = () => new Date().toLocaleDateString("sv-SE");
const dataBR = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};
const tom = (cor: string) => ({ "--tom": cor }) as CSSProperties;

function prazoTexto(dias: number | null): string {
  if (dias == null) return "";
  if (dias < 0) return dias === -1 ? "venceu ontem" : `venceu há ${-dias} dias`;
  if (dias === 0) return "vence hoje";
  if (dias < 60) return `faltam ${dias} dias`;
  const meses = Math.round(dias / 30);
  return meses < 24 ? `faltam ${meses} meses` : `faltam ${Math.round(meses / 12)} anos`;
}

function iniciais(nome: string | null): string {
  const p = (nome ?? "").replace(/^[\d.\s]+/, "").split(/\s+/).filter((x) => x.length > 1);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "—";
}

const todosSistemas = (l: Linha) => [...new Set((l.servicos ?? []).flatMap((x) => x.sistemas))].sort();

const Ico = {
  busca: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  olho: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>,
  consultar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>,
  csv: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" /></svg>,
  moeda: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1.1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5v11" /></svg>,
};

export default function Procuracoes() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [busca, setBusca] = useState("");
  const [filtroVig, setFiltroVig] = useState<"" | Vigencia>("");
  const [soAtivas, setSoAtivas] = useState(true);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [pagina, setPagina] = useState(0);
  const [detalhe, setDetalhe] = useState<Linha | null>(null);

  const [lote, setLote] = useState<{ feitos: number; total: number; falhas: number; atual: string } | null>(null);
  const parar = useRef(false);
  const [pularHoje, setPularHoje] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/paralegal/procuracoes", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? j.erro ?? "Falha ao carregar.");
      setLinhas(j.linhas);
      setAviso(j.avisoCarteira);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const h = hoje();
  const vig = useCallback((l: Linha) => vigencia(l, h), [h]);

  const temCarteira = useMemo(() => linhas.some((l) => l.ativa_questor), [linhas]);
  const filtrarAtivas = soAtivas && temCarteira;

  // Ordem padrão: o que precisa de ação primeiro (vencidas, vencendo…), depois pela data.
  const filtrados = useMemo(() => {
    const q = semAcento(busca.trim());
    const qDig = busca.replace(/\D/g, "");
    return linhas.filter((l) => {
      if (filtrarAtivas && !l.ativa_questor) return false;
      if (filtroVig && vig(l) !== filtroVig) return false;
      if (!q) return true;
      return semAcento(l.razao_social ?? "").includes(q)
        || (qDig.length >= 3 && l.cnpj.includes(qDig))
        || String(l.codigoempresa ?? "") === busca.trim();
    }).sort((a, b) => ORDEM[vig(a)] - ORDEM[vig(b)]
      || (a.data_fim ?? "9999").localeCompare(b.data_fim ?? "9999")
      || (a.razao_social ?? "").localeCompare(b.razao_social ?? "", "pt-BR"));
  }, [linhas, busca, filtroVig, filtrarAtivas, vig]);

  useEffect(() => { setPagina(0); }, [busca, filtroVig, filtrarAtivas]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const visiveis = filtrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

  const kpis = useMemo(() => {
    const base = linhas.filter((l) => !filtrarAtivas || l.ativa_questor);
    const c = (k: Vigencia) => base.filter((l) => vig(l) === k).length;
    return {
      total: base.length, em_dia: c("em_dia"), vencendo: c("vencendo"), vencida: c("vencida"),
      sem: c("sem_procuracao") + c("erro") + c("nunca"),
    };
  }, [linhas, filtrarAtivas, vig]);

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

  async function consultar(alvos: Linha[], respeitarHoje = pularHoje) {
    const fila = respeitarHoje ? alvos.filter((l) => (l.ultima_consulta ?? "").slice(0, 10) !== hoje()) : alvos;
    if (!fila.length) { setMsg("As empresas selecionadas já foram consultadas hoje."); return; }
    const quem = fila.length === 1 ? (fila[0].razao_social ?? formatCNPJ(fila[0].cnpj)) : `${fila.length} empresas`;
    if (!confirm(`Consultar a procuração de ${quem} no e-CAC?\n\nCada consulta é cobrada pelo SERPRO.`)) return;

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
        const r = await fetch("/api/paralegal/procuracoes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cnpj: l.cnpj, razao_social: l.razao_social }),
        });
        const j = await r.json().catch(() => ({ error: `Resposta inválida (HTTP ${r.status}).` }));
        if (!r.ok || !j.ok) { falhas++; erros.push(`${l.razao_social ?? l.cnpj}: ${j.error ?? j.erro ?? j.mensagem ?? "falhou"}`); }
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

  function baixarCsv() {
    const cab = ["Código", "Razão social", "CNPJ", "Vigência", "Vence em", "Prazo", "Serviços", "Última consulta"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const corpo = filtrados.map((l) => [
      l.codigoempresa, l.razao_social, formatCNPJ(l.cnpj), ROTULO[vig(l)], dataBR(l.data_fim),
      prazoTexto(diasAte(l.data_fim, h)), todosSistemas(l).join(", "), dataBR(l.ultima_consulta),
    ].map(esc).join(";"));
    const blob = new Blob(["﻿" + [cab.map(esc).join(";"), ...corpo].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `procuracoes_${hoje()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const ocupado = !!lote;
  const selecionadasLinhas = linhas.filter((l) => selecionados.has(l.cnpj));
  const pct = (n: number) => (kpis.total ? Math.round((n / kpis.total) * 100) : 0);

  const kpi = (k: "" | Vigencia, rotulo: string, valor: number, desc: string, cor: string) => (
    <button type="button" className={`${s.kpi} ${filtroVig === k && k ? s.ativo : ""}`} style={tom(cor)}
            onClick={() => setFiltroVig(filtroVig === k || !k ? "" : k)}>
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
        {kpi("", "Empresas", kpis.total, filtrarAtivas ? "ativas no Questor" : "com consulta salva", "#475569")}
        {kpi("em_dia", "Em dia", kpis.em_dia, `${pct(kpis.em_dia)}% · mais de ${DIAS_ALERTA} dias`, TOM.em_dia)}
        {kpi("vencendo", "Vencendo", kpis.vencendo, `em até ${DIAS_ALERTA} dias`, TOM.vencendo)}
        {kpi("vencida", "Vencidas", kpis.vencida, "renovar no e-CAC", TOM.vencida)}
        {kpi("sem_procuracao", "Sem procuração", kpis.sem, "inclui erro e não consultada", TOM.sem_procuracao)}
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
          <select className={s.select} value={filtroVig} onChange={(e) => setFiltroVig(e.target.value as typeof filtroVig)}>
            <option value="">Todas as vigências</option>
            {(Object.keys(ROTULO) as Vigencia[]).map((k) => <option key={k} value={k}>{ROTULO[k]}</option>)}
          </select>
          {temCarteira && (
            <button type="button" className={`${s.toggle} ${soAtivas ? s.on : ""}`} onClick={() => setSoAtivas((v) => !v)}>
              Só carteira ativa
            </button>
          )}
          <span className={s.espaco} />
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
              {Ico.consultar} Consultar no e-CAC
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
                <th>Vigência</th>
                <th>Vence em</th>
                <th>Serviços</th>
                <th>Última consulta</th>
                <th className={s.colAcoes}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <tr><td className={s.vazio} colSpan={7}>Carregando empresas…</td></tr>}
              {!carregando && visiveis.length === 0 && (
                <tr><td className={s.vazio} colSpan={7}>Nenhuma empresa com esses filtros.</td></tr>
              )}
              {!carregando && visiveis.map((l) => {
                const k = vig(l);
                const marcada = selecionados.has(l.cnpj);
                const sistemas = todosSistemas(l);
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
                      <span className={s.pill} style={tom(TOM[k])} title={l.mensagem ?? undefined}><i />{ROTULO[k]}</span>
                    </td>
                    <td>
                      <div className={s.data}>{dataBR(l.data_fim)}</div>
                      <div className={s.dataSub}>{prazoTexto(diasAte(l.data_fim, h))}</div>
                    </td>
                    <td>
                      {sistemas.length
                        ? <span className={`${s.pill} ${s.pillSuave}`} title={sistemas.join(", ")}>{sistemas.length} serviço(s)</span>
                        : <span className={s.dataSub}>—</span>}
                    </td>
                    <td>
                      <div className={s.data}>{dataBR(l.ultima_consulta)}</div>
                    </td>
                    <td className={s.colAcoes}>
                      <div className={s.acoes}>
                        <button className={s.icone} title="Ver detalhes" onClick={() => setDetalhe(l)}>{Ico.olho}</button>
                        <button className={s.icone} title="Consultar no e-CAC (cobrado)" disabled={ocupado}
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
          <aside className={s.lateral} role="dialog" aria-label="Detalhes da procuração">
            <div className={s.lateralTopo}>
              <span className={s.avatar}>{iniciais(detalhe.razao_social)}</span>
              <div style={{ flex: 1 }}>
                <h3>{detalhe.razao_social ?? "—"}</h3>
                <div className={s.empresaSub}>{formatCNPJ(detalhe.cnpj)}{detalhe.codigoempresa != null && ` · cód. ${detalhe.codigoempresa}`}</div>
              </div>
              <button className={s.avisoFechar} onClick={() => setDetalhe(null)} aria-label="Fechar">×</button>
            </div>
            <div className={s.lateralCorpo}>
              <div className={s.grade2}>
                <div className={s.campo}>
                  <span className={s.campoRotulo}>Vigência</span>
                  <span><span className={s.pill} style={tom(TOM[vig(detalhe)])}><i />{ROTULO[vig(detalhe)]}</span></span>
                </div>
                <div className={s.campo}>
                  <span className={s.campoRotulo}>Vence em</span>
                  <span className={s.campoValor}>{dataBR(detalhe.data_fim)} <span className={s.dataSub}>{prazoTexto(diasAte(detalhe.data_fim, h))}</span></span>
                </div>
                <div className={s.campo}>
                  <span className={s.campoRotulo}>Última consulta</span>
                  <span className={s.campoValor}>{dataBR(detalhe.ultima_consulta)}</span>
                </div>
              </div>
              {detalhe.mensagem && (
                <div className={s.campo}>
                  <span className={s.campoRotulo}>Retorno da Receita</span>
                  <span className={s.campoValor}>{detalhe.mensagem}</span>
                </div>
              )}
              <div className={s.campo}>
                <span className={s.campoRotulo}>Serviços outorgados</span>
                {(detalhe.servicos ?? []).length === 0 && <span className={s.campoValor}>—</span>}
                {(detalhe.servicos ?? []).map((sv, i) => (
                  <div key={i} className={s.campoValor} style={{ borderTop: i ? "1px solid var(--border)" : undefined, paddingTop: i ? 10 : 0 }}>
                    <div className={s.dataSub}>Expira em {dataBR(sv.dtexpiracao)} · {sv.nrsistemas ?? sv.sistemas.length} sistema(s)</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {sv.sistemas.map((x) => <span key={x} className={`${s.pill} ${s.pillSuave}`}>{x}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={s.lateralPe}>
              <button className={`${s.botao} ${s.primario}`} disabled={ocupado} onClick={() => consultar([detalhe], false)}>
                {Ico.consultar} Consultar no e-CAC
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
