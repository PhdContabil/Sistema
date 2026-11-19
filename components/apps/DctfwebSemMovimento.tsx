"use client";

// Fiscal · DCTFWeb › Sem movimento. Apontar é grátis (Questor). O R-2099 vai
// direto à EFD-Reinf com o certificado da PHD (sem custo); a DCTFWeb sai pelo
// Integra (cobrado, irreversível). Tudo por clique, com confirmação.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { formatBRL, formatCNPJ } from "@/lib/conciliacao";
import s from "./PainelPadrao.module.css";

interface Reg {
  id: number; cnpj: string; razao_social: string | null; codigoempresa: number | null; competencia: string;
  debito_anterior: number | null; situacao: string; ambiente: number | null; protocolo: string | null;
  recibo_r2099: string | null; erro: string | null; ativa: boolean; encerrada_em: string | null; updated_at: string;
}

const ROT: Record<string, [string, string]> = {
  apontada: ["Apontada", "#2563eb"], r2099_enviado: ["R-2099 enviado", "#d97706"], r2099_aceito: ["R-2099 aceito", "#0891b2"],
  r2099_erro: ["Erro", "#dc2626"], concluida: ["Entregue", "#16a34a"], dispensada: ["Dispensada", "#64748b"],
};
const tom = (cor: string) => ({ "--tom": cor }) as CSSProperties;
const compBR = (c: string | null) => (c ? `${c.slice(5, 7)}/${c.slice(0, 4)}` : "—");
function compPadrao() {
  const d = new Date(); const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`;
}
const ultimas = () => Array.from({ length: 12 }, (_, i) => {
  const d = new Date(); const p = new Date(d.getFullYear(), d.getMonth() - 1 - i, 1);
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`;
});

async function post(corpo: Record<string, unknown>) {
  const r = await fetch("/api/fiscal/dctfweb/sem-movimento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

export default function SemMovimento() {
  const [competencia, setCompetencia] = useState(compPadrao());
  const [linhas, setLinhas] = useState<Reg[]>([]);
  const [ambiente, setAmbiente] = useState<number>(2);
  const [sinc, setSinc] = useState({ atual: 0, anterior: 0 });
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"" | "fila" | "seguem">("");
  const parar = useRef(false);

  const carregar = useCallback(async (c: string) => {
    setCarregando(true); setErro(null);
    try {
      const r = await fetch(`/api/fiscal/dctfweb/sem-movimento?competencia=${c}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falha ao carregar.");
      setLinhas(j.linhas); setAmbiente(j.ambiente); setSinc(j.sincronizadas);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(competencia); }, [carregar, competencia]);

  const daComp = useMemo(() => linhas.filter((l) => l.competencia === competencia), [linhas, competencia]);
  const seguem = useMemo(() => linhas.filter((l) => l.ativa && l.competencia < competencia), [linhas, competencia]);
  const fila = daComp.filter((l) => l.situacao === "apontada" || l.situacao === "r2099_erro");
  const visiveis = filtro === "seguem" ? seguem : filtro === "fila" ? fila : daComp;
  const producao = ambiente === 1;

  async function acao(l: Reg, a: string) {
    setOcupado(`${l.id}-${a}`); setErro(null);
    try {
      const j = await post({ acao: a, id: l.id });
      if (j.ok === false) setErro(`${l.razao_social ?? l.cnpj}: ${j.mensagem ?? j.motivo}`);
      else if (a === "conferir") setMsg(`${l.razao_social}: ${j.estado === "aceito" ? `R-2099 aceito${j.recibo ? ` (recibo ${j.recibo})` : ""}` : j.estado === "processando" ? "a Receita ainda está processando, confira de novo em alguns minutos" : `rejeitado: ${j.mensagem}`}`);
      else if (a === "enviar") setMsg(`${l.razao_social}: R-2099 enviado (protocolo ${j.protocolo}). Use “Conferir” para ver o resultado.`);
      else if (a === "transmitir") setMsg(`${l.razao_social}: DCTFWeb sem movimento transmitida.`);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setOcupado(null); carregar(competencia); }
  }

  function confirmarEnvio(qtd: number) {
    return window.confirm(producao
      ? `Enviar o R-2099 SEM MOVIMENTO de ${qtd} empresa(s) em PRODUÇÃO, competência ${compBR(competencia)}?\n\nIsso fecha o período na EFD-Reinf de verdade. Para corrigir depois é preciso reabrir (R-2098).`
      : `Enviar o R-2099 de ${qtd} empresa(s) em PRODUÇÃO RESTRITA (teste)? Não tem efeito real.`);
  }

  async function enviarTodas() {
    if (!fila.length || !confirmarEnvio(fila.length)) return;
    parar.current = false; let ok = 0, falhas = 0;
    for (const [i, l] of fila.entries()) {
      if (parar.current) break;
      setOcupado(`lote ${i + 1}/${fila.length} · ${l.razao_social ?? l.cnpj}`);
      try { const j = await post({ acao: "enviar", id: l.id }); if (j.ok === false) falhas++; else ok++; } catch { falhas++; }
    }
    setOcupado(null); setMsg(`R-2099: ${ok} enviado(s), ${falhas} falha(s). Confira os protocolos em alguns minutos.`);
    carregar(competencia);
  }

  async function apontar() {
    setOcupado("apontar"); setErro(null);
    try {
      const j = await post({ acao: "apontar", competencia });
      setMsg(`${j.apontadas} empresa(s) apontada(s) como sem movimento em ${compBR(competencia)}${j.voltaram ? ` · ${j.voltaram} voltaram a ter movimento e saíram da lista` : ""}.`);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setOcupado(null); carregar(competencia); }
  }

  async function trocarAmbiente() {
    const novo = producao ? 2 : 1;
    if (novo === 1 && !window.confirm("Passar o R-2099 para PRODUÇÃO? A partir daí os envios fecham o período de verdade na Receita.")) return;
    try { await post({ acao: "ambiente", valor: novo }); setAmbiente(novo); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }

  const kpi = (f: typeof filtro, rot: string, val: number, desc: string, cor: string) => (
    <button type="button" className={`${s.kpi} ${filtro === f && f ? s.ativo : ""}`} style={tom(cor)} onClick={() => setFiltro(filtro === f ? "" : f)}>
      <div className={s.kpiRotulo}>{rot}</div><div className={s.kpiValor}>{val.toLocaleString("pt-BR")}</div><div className={s.kpiDesc}>{desc}</div>
    </button>
  );

  return (
    <>
      {erro && <div className={`${s.aviso} ${s.erro}`}><strong>Erro:</strong> {erro}<button className={s.avisoFechar} onClick={() => setErro(null)} aria-label="Fechar">×</button></div>}
      <div className={`${s.aviso} ${producao ? s.erro : s.info}`}>
        <span>
          R-2099 em <strong>{producao ? "PRODUÇÃO" : "PRODUÇÃO RESTRITA (teste)"}</strong>
          {producao ? " — os envios fecham o período na EFD-Reinf." : " — os envios não têm efeito real; a DCTFWeb só sai depois de passar para produção."}
        </span>
        <span className={s.espaco} />
        <button className={s.botao} onClick={trocarAmbiente}>{producao ? "Voltar para teste" : "Passar para produção"}</button>
      </div>

      <div className={s.kpis}>
        {kpi("", "Sem movimento em " + compBR(competencia), daComp.length, "movimento no mês anterior, nada neste", "#2563eb")}
        {kpi("fila", "A enviar", fila.length, "apontadas ou com erro", "#d97706")}
        {kpi("", "Entregues", daComp.filter((l) => l.situacao === "concluida").length, "R-2099 + DCTFWeb", "#16a34a")}
        {kpi("seguem", "Seguem sem movimento", seguem.length, "de meses anteriores · fora da fila", "#64748b")}
      </div>

      {msg && <div className={`${s.aviso} ${s.info}`}><span>{msg}</span><button className={s.avisoFechar} onClick={() => setMsg(null)} aria-label="Fechar">×</button></div>}

      <div className={s.painel}>
        <div className={s.barra}>
          <select className={s.select} value={competencia} disabled={!!ocupado} onChange={(e) => setCompetencia(e.target.value)} aria-label="Competência">
            {ultimas().map((c) => <option key={c} value={c}>{compBR(c)}</option>)}
          </select>
          <span className={s.dataSub}>Questor: {sinc.anterior} em {compBR(prevComp(competencia))} · {sinc.atual} em {compBR(competencia)}</span>
          <span className={s.espaco} />
          <button className={s.botao} disabled={!!ocupado} onClick={apontar} title="Sincroniza os dois meses do Questor e aponta quem ficou sem movimento (sem custo).">
            {ocupado === "apontar" ? "Apontando…" : "Apontar sem movimento"}
          </button>
          <button className={`${s.botao} ${s.primario}`} disabled={!!ocupado || !fila.length} onClick={enviarTodas}>Enviar R-2099 ({fila.length})</button>
          {ocupado?.startsWith("lote") && <button className={`${s.botao} ${s.perigo}`} onClick={() => { parar.current = true; }}>Parar</button>}
        </div>
        {ocupado?.startsWith("lote") && <div className={s.selecao}><strong>Enviando {ocupado.slice(5)}</strong></div>}

        <div className={s.tabelaWrap}>
          <table className={s.tabela}>
            <thead><tr><th>Empresa</th><th>Sem movimento desde</th><th style={{ textAlign: "right" }}>Débito mês anterior</th><th>Situação</th><th>R-2099</th><th className={s.colAcoes}>Ações</th></tr></thead>
            <tbody>
              {carregando && <tr><td className={s.vazio} colSpan={6}>Carregando…</td></tr>}
              {!carregando && !visiveis.length && <tr><td className={s.vazio} colSpan={6}>
                {filtro === "seguem" ? "Nenhuma empresa seguindo sem movimento." : "Nada apontado nesta competência. Use “Apontar sem movimento”."}
              </td></tr>}
              {!carregando && visiveis.map((l) => {
                const [rot, cor] = ROT[l.situacao] ?? [l.situacao, "#64748b"];
                const b = (a: string) => ocupado === `${l.id}-${a}`;
                return (
                  <tr key={l.id}>
                    <td><div className={s.empresaNome}>{l.razao_social ?? "—"}</div>
                      <div className={s.empresaSub}>{formatCNPJ(l.cnpj)}{l.codigoempresa != null && <> · cód. {l.codigoempresa}</>}</div></td>
                    <td>{compBR(l.competencia)}{!l.ativa && l.encerrada_em && <div className={s.dataSub}>movimento voltou em {compBR(l.encerrada_em)}</div>}</td>
                    <td style={{ textAlign: "right" }}>{l.debito_anterior == null ? "—" : `R$ ${formatBRL(Number(l.debito_anterior))}`}</td>
                    <td><span className={s.pill} style={tom(cor)} title={l.erro ?? undefined}><i />{rot}</span>
                      {l.erro && <div className={s.dataSub} style={{ maxWidth: 280, whiteSpace: "normal" }}>{l.erro}</div>}</td>
                    <td><span className={s.dataSub}>{l.protocolo ? `${l.ambiente === 1 ? "" : "[teste] "}prot. ${l.protocolo}` : "—"}{l.recibo_r2099 && <><br />recibo {l.recibo_r2099}</>}</span></td>
                    <td className={s.colAcoes}><div className={s.acoes}>
                      {(l.situacao === "apontada" || l.situacao === "r2099_erro") && <>
                        <button className={s.botao} disabled={!!ocupado} onClick={() => confirmarEnvio(1) && acao(l, "enviar")}>{b("enviar") ? "Enviando…" : "Enviar R-2099"}</button>
                        <button className={s.botao} disabled={!!ocupado} title="Tirar da fila (teve movimento que o Questor não mostrou)"
                                onClick={() => window.confirm(`Dispensar ${l.razao_social}?`) && acao(l, "dispensar")}>Dispensar</button>
                      </>}
                      {l.situacao === "r2099_enviado" && <button className={s.botao} disabled={!!ocupado} onClick={() => acao(l, "conferir")}>{b("conferir") ? "Conferindo…" : "Conferir"}</button>}
                      {l.situacao === "r2099_aceito" && (l.ambiente === 1
                        ? <button className={`${s.botao} ${s.primario}`} disabled={!!ocupado}
                                  onClick={() => window.confirm(`Transmitir a DCTFWeb sem movimento de ${l.razao_social} (${compBR(l.competencia)})? Cobrado pelo SERPRO e irreversível.`) && acao(l, "transmitir")}>
                            {b("transmitir") ? "Transmitindo…" : "Transmitir DCTFWeb"}</button>
                        : <span className={s.dataSub}>teste OK</span>)}
                    </div></td>
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

function prevComp(c: string) {
  const [a, m] = c.split("-").map(Number); const d = new Date(a, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
