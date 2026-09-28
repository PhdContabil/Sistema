"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatBRL, formatCNPJ } from "@/lib/conciliacao";
import { formatDataHora } from "@/lib/datas";
import { NOME_IMPOSTO, type Regime } from "@/lib/dare-sp-calculo";

interface GuiaResumo {
  id: string;
  total: number;
  data_pagamento: string;
  numero_controle: string | null;
  linha_digitavel: string | null;
  zen_documento_id: string | null;
  zen_enviado_em: string | null;
  zen_erro?: string | null;
  tareffa_documento_id?: string | null;
  tareffa_erro?: string | null;
  emitida_em: string;
  emitida_por: string | null;
}

interface Debito {
  codigoempresa: number;
  codigoestab: number;
  competencia: string;
  codigoimposto: string;
  cnpj: string | null;
  nome: string | null;
  valor: number;
  vencimento: string | null;
  vencimento_manual: boolean;
  vencimento_origem?: "manual" | "calendario" | "regra" | null;
  sincronizado_em: string;
  guias: GuiaResumo[];
}

/** Resultado do cálculo, espelhando `montarGuia` do servidor. */
interface Calculo {
  principal: number;
  multa: { percentual: number; valor: number; dias: number; descricao: string };
  juros: { percentual: number; valor: number; memoria: string; faltando: string[] };
  total: number;
  incompleta: boolean;
  impedimento: string | null;
}

function chaveDe(d: Debito): string {
  return `${d.codigoempresa}|${d.codigoestab}|${d.competencia}|${d.codigoimposto}`;
}

/** Data de pagamento sugerida: o vencimento, se ainda não passou; senão, hoje. */
function pagamentoPadrao(vencimento: string | null): string {
  const h = hoje();
  return vencimento && /^\d{4}-\d{2}-\d{2}$/.test(vencimento) && vencimento > h ? vencimento : h;
}

/** Minúsculas e sem acento: "Comércio" acha "COMERCIO". */
function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dataBR(iso: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

function venceu(iso: string | null): boolean {
  return !!iso && iso < hoje();
}

export default function DareSp({
  competenciasIniciais, competenciaAtual, debitosIniciais, temChaveSefaz, temTokenZen, erroServidor,
}: {
  competenciasIniciais: string[];
  competenciaAtual: string | null;
  debitosIniciais: Debito[];
  temChaveSefaz: boolean;
  temTokenZen: boolean;
  erroServidor: string | null;
}) {
  const [competencias, setCompetencias] = useState(competenciasIniciais);
  const [competencia, setCompetencia] = useState(competenciaAtual ?? "");
  const [debitos, setDebitos] = useState<Debito[]>(debitosIniciais);

  const [busca, setBusca] = useState("");
  const [soPendentes, setSoPendentes] = useState(false);
  const [imposto, setImposto] = useState("");

  const [carregando, setCarregando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState<string | null>(erroServidor);
  const [aviso, setAviso] = useState<string | null>(null);
  // Guarda a chave, não o objeto: depois de emitir, a lista recarrega e o
  // modal precisa mostrar a guia nova e o estado do Zen, não a foto do clique.
  const [abertoChave, setAbertoChave] = useState<string | null>(null);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  const carregar = useCallback(async (comp: string) => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/fiscal/dare-sp?competencia=${encodeURIComponent(comp)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falha ao carregar.");
      setDebitos(j.debitos ?? []);
      setCompetencias(j.competencias ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  async function sincronizar() {
    setSincronizando(true);
    setErro(null);
    try {
      const r = await fetch("/api/fiscal/dare-sp/sincronizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(competencia ? { competencia } : { meses: 6 }),
      });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Falha ao sincronizar."); return; }

      let msg = `${j.gravados} débito(s) sincronizado(s).`;
      if (j.calendarioIndisponivel) {
        msg += ` Calendário do Questor fora do ar (${j.calendarioIndisponivel}): vencimentos na regra fixa.`;
      } else if (j.semCalendario?.length > 0) {
        const lista = j.semCalendario.map((x: { imposto: string; competencia: string; quantidade: number }) =>
          `${x.imposto} ${x.competencia} (${x.quantidade})`).join(", ");
        msg += ` Sem calendário no Questor, na regra fixa: ${lista}.`;
      }
      if (j.camposDesconhecidos?.length > 0) {
        // Contrato da API mudou: melhor aparecer aqui do que virar coluna vazia.
        msg += ` Campos novos na API: ${j.camposDesconhecidos.join(", ")}.`;
      }
      setAviso(msg);
      await carregar(competencia || (j.competencias?.[0] ?? ""));
    } catch {
      setErro("Falha de rede ao sincronizar.");
    } finally {
      setSincronizando(false);
    }
  }

  const aberto = abertoChave ? debitos.find((d) => chaveDe(d) === abertoChave) ?? null : null;

  const filtrados = useMemo(() => {
    const q = semAcento(busca.trim());
    // Só os dígitos da busca, para achar CNPJ digitado com ou sem máscara.
    // Vazio quando a busca é texto — e aí NÃO pode entrar no teste: "".includes("")
    // é verdadeiro para qualquer CNPJ, e a lista inteira passava no filtro.
    const digitos = q.replace(/\D/g, "");
    return debitos.filter((d) => {
      if (imposto && d.codigoimposto !== imposto) return false;
      if (soPendentes && d.guias.length > 0) return false;
      if (!q) return true;
      if (semAcento(d.nome ?? "").includes(q)) return true;
      if (digitos && (d.cnpj ?? "").includes(digitos)) return true;
      return digitos !== "" && String(d.codigoempresa) === digitos;
    });
  }, [debitos, busca, imposto, soPendentes]);

  const totais = useMemo(() => {
    let valor = 0, comGuia = 0, semVencimento = 0, noZen = 0;
    for (const d of filtrados) {
      valor += Number(d.valor) || 0;
      if (d.guias.length > 0) comGuia++;
      if (!d.vencimento) semVencimento++;
      if (d.guias.some((g) => g.zen_documento_id)) noZen++;
    }
    return { valor, comGuia, semVencimento, noZen, total: filtrados.length };
  }, [filtrados]);

  const impostosPresentes = useMemo(
    () => [...new Set(debitos.map((d) => d.codigoimposto))].sort(),
    [debitos]
  );

  function baixarCsv() {
    const cab = [
      "Cód. empresa", "Estab.", "Empresa", "CNPJ", "Competência", "Imposto",
      "Valor", "Vencimento", "Guias emitidas", "No Zen",
    ];
    const linhas = filtrados.map((d) => [
      d.codigoempresa, d.codigoestab, d.nome ?? "", d.cnpj ?? "", d.competencia,
      NOME_IMPOSTO[d.codigoimposto] ?? d.codigoimposto,
      String(d.valor).replace(".", ","),
      dataBR(d.vencimento), d.guias.length,
      d.guias.some((g) => g.zen_documento_id) ? "Sim" : "Não",
    ]);
    const esc = (v: string | number) => {
      const s = String(v ?? "");
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cab, ...linhas].map((l) => l.map(esc).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `dare-sp-${(competencia || "todas").replace("/", "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="dare">
      {erro && <div className="banner error">{erro}</div>}
      {aviso && <div className="banner">{aviso}</div>}

      {!temChaveSefaz && (
        <div className="banner error">
          <strong>Chave da Sefaz-SP não configurada.</strong> A tela lista e calcula, mas a
          emissão fica indisponível até <code>SEFAZ_SP_DARE_API_KEY</code> existir no ambiente.
        </div>
      )}

      {/* ---- competência e ações ---- */}
      <div className="card dare-topo">
        <div className="dare-topo-id">
          <strong>DARE-SP — competência</strong>
          <span className="desc">ICMS por competência, vindo da API Questor.</span>
        </div>

        <select className="search" value={competencia}
                onChange={(e) => { setCompetencia(e.target.value); carregar(e.target.value); }}>
          {competencias.length === 0 && <option value="">Nada sincronizado ainda</option>}
          {competencias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <button className="btn" disabled={sincronizando} onClick={sincronizar}>
          {sincronizando ? "Sincronizando…" : "↻ Sincronizar dados"}
        </button>
      </div>

      {/* ---- indicadores ---- */}
      <div className="summary">
        <div className="card">
          <div className="k">Débitos</div>
          <div className="v num">{totais.total}</div>
          <div className="desc">na competência</div>
        </div>
        <div className="card">
          <div className="k">Valor total</div>
          <div className="v num">R$ {formatBRL(totais.valor)}</div>
          <div className="desc">soma do imposto</div>
        </div>
        <div className="card ok">
          <div className="k">Com guia</div>
          <div className="v num">{totais.comGuia}</div>
          <div className="desc">{totais.noZen} no Zen</div>
        </div>
        <div className={`card ${totais.semVencimento > 0 ? "div" : ""}`}>
          <div className="k">Sem vencimento</div>
          <div className="v num">{totais.semVencimento}</div>
          <div className="desc">precisam de data</div>
        </div>
      </div>

      {/* ---- filtros ---- */}
      <div className="toolbar">
        <input className="search" placeholder="Buscar empresa, CNPJ ou código…"
               value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="search" value={imposto} onChange={(e) => setImposto(e.target.value)}>
          <option value="">Todos os impostos</option>
          {impostosPresentes.map((c) => (
            <option key={c} value={c}>{NOME_IMPOSTO[c] ?? c}</option>
          ))}
        </select>
        <span className={`chip ${soPendentes ? "on" : ""}`} onClick={() => setSoPendentes((v) => !v)}>
          Sem guia
        </span>
        <button className="btn" disabled={carregando} onClick={() => carregar(competencia)}>
          Recarregar
        </button>
        <button className="btn" onClick={baixarCsv}>↓ CSV</button>
        <span className="contador">{filtrados.length} de {debitos.length}</span>
      </div>

      {/* ---- tabela ---- */}
      <div className="table-wrap">
        <table className="grid dare-grid">
          <thead>
            <tr>
              <th className="col-empresa">Empresa</th>
              <th>CNPJ</th>
              <th className="c-res">Imposto</th>
              <th className="num">Valor</th>
              <th className="c-res">Vencimento</th>
              <th className="c-res">Guia</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr><td className="loading" colSpan={7}>Carregando…</td></tr>
            )}
            {!carregando && filtrados.length === 0 && (
              <tr>
                <td className="loading" colSpan={7}>
                  {debitos.length === 0
                    ? "Nada sincronizado ainda — use Sincronizar dados."
                    : "Nenhum débito com esses filtros."}
                </td>
              </tr>
            )}
            {!carregando && filtrados.map((d) => {
              const ultima = d.guias[0];
              return (
                <tr key={`${d.codigoempresa}-${d.codigoestab}-${d.competencia}-${d.codigoimposto}`}>
                  <td className="col-empresa">
                    <span className="emp-nome">{d.nome ?? `Empresa #${d.codigoempresa}`}</span>
                    <span className="cnpj"><span className="codigo">emp. {d.codigoempresa}</span> · estab. {d.codigoestab}</span>
                  </td>
                  <td>{d.cnpj ? formatCNPJ(d.cnpj) : "—"}</td>
                  <td className="c-res">
                    <span className="badge badge-soft">{NOME_IMPOSTO[d.codigoimposto] ?? d.codigoimposto}</span>
                  </td>
                  <td className="num">R$ {formatBRL(d.valor)}</td>
                  <td className={`c-res ${venceu(d.vencimento) ? "res-div" : ""}`}>
                    {dataBR(d.vencimento)}
                    {d.vencimento_manual && <span className="dare-manual" title="Vencimento ajustado à mão">·</span>}
                    {d.vencimento_origem === "regra" && (
                      <span className="dare-sem-cal" title="O calendário do Questor não tem esta competência para este imposto: o vencimento é a regra fixa (último dia do 2º mês seguinte). Confira antes de emitir.">!</span>
                    )}
                  </td>
                  <td className="c-res">
                    {ultima ? (
                      <span className="badge badge-soft" title={`Emitida em ${formatDataHora(ultima.emitida_em)}`}>
                        R$ {formatBRL(ultima.total)}
                        {ultima.zen_documento_id ? " · Zen" : ""}
                      </span>
                    ) : <span className="dash">—</span>}
                  </td>
                  <td>
                    <button className="btn" onClick={() => setAbertoChave(chaveDe(d))}>
                      {ultima ? "Ver / nova guia" : "Gerar guia"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="footnote">
        O vencimento vem de uma regra padrão (último dia do segundo mês seguinte) e pode ser
        corrigido no detalhe — a Questor não devolve prazo de recolhimento, e no RPA ele varia
        por CNAE. Corrigido à mão, a sincronização não desfaz.
      </p>

      {aberto && (
        <ModalGuia
          debito={aberto}
          temChaveSefaz={temChaveSefaz}
          temTokenZen={temTokenZen}
          onFechar={() => setAbertoChave(null)}
          onMudou={() => carregar(competencia)}
          onAviso={setAviso}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- modal

function ModalGuia({
  debito, temChaveSefaz, temTokenZen, onFechar, onMudou, onAviso,
}: {
  debito: Debito;
  temChaveSefaz: boolean;
  temTokenZen: boolean;
  onFechar: () => void;
  onMudou: () => void;
  onAviso: (m: string) => void;
}) {
  const [vencimento, setVencimento] = useState(debito.vencimento ?? "");
  // Débito que ainda não venceu é pago no vencimento, não hoje: a data de
  // pagamento vira o vencimento da guia na Sefaz, e antecipar sem motivo só
  // encurta o prazo do cliente.
  const [pagamento, setPagamento] = useState(() => pagamentoPadrao(debito.vencimento));
  const [regime, setRegime] = useState<Regime>("simples");

  const [calculo, setCalculo] = useState<Calculo | null>(null);
  const [receita, setReceita] = useState<{ codigo: string; nome: string; codigoServico: number } | null>(null);
  const [previa, setPrevia] = useState(false);
  const [emitindo, setEmitindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avisosEmissao, setAvisosEmissao] = useState<string[]>([]);
  const [reenviando, setReenviando] = useState<string | null>(null);

  const [precisaEndereco, setPrecisaEndereco] = useState(false);
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [telefone, setTelefone] = useState("");

  const [resultado, setResultado] = useState<{
    linhaDigitavel: string | null; pix: string | null; numeroControle: string | null; id?: string;
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { if (vencimento && pagamento) calcular(); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vencimento, pagamento, regime]);

  useEffect(() => {
    if (!debito.cnpj) return;
    fetch(`/api/fiscal/dare-sp/contribuinte?cnpj=${debito.cnpj}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.contribuinte) {
          setEndereco(j.contribuinte.endereco ?? "");
          setCidade(j.contribuinte.cidade ?? "");
          setTelefone(j.contribuinte.telefone ?? "");
        } else {
          setPrecisaEndereco(true);
        }
      })
      .catch(() => {});
  }, [debito.cnpj]);

  async function calcular() {
    setPrevia(true);
    setErro(null);
    try {
      const r = await fetch("/api/fiscal/dare-sp/acrescimos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          principal: debito.valor, vencimento, pagamento,
          codigoimposto: debito.codigoimposto, regime,
        }),
      });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Falha ao calcular."); setCalculo(null); return; }
      setCalculo(j.guia);
      setReceita(j.receita);
    } catch {
      setErro("Falha de rede ao calcular.");
    } finally {
      setPrevia(false);
    }
  }

  async function guardarVencimento() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) return;
    if (vencimento === debito.vencimento) return;
    await fetch("/api/fiscal/dare-sp/vencimento", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codigoempresa: debito.codigoempresa, codigoestab: debito.codigoestab,
        competencia: debito.competencia, codigoimposto: debito.codigoimposto, vencimento,
      }),
    });
    onMudou();
  }

  async function emitir(comZen: boolean) {
    setEmitindo(true);
    setErro(null);
    try {
      const r = await fetch("/api/fiscal/dare-sp/emitir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigoempresa: debito.codigoempresa, codigoestab: debito.codigoestab,
          competencia: debito.competencia, codigoimposto: debito.codigoimposto,
          pagamento, regime,
          codigoServico: receita?.codigoServico,
          endereco: precisaEndereco || endereco
            ? { endereco, cidade, uf: "SP", telefone }
            : undefined,
          enviarZen: comZen,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        if (j.faltaEndereco) setPrecisaEndereco(true);
        setErro(j.error ?? "Falha ao emitir.");
        return;
      }
      setResultado({ ...j.guia, id: j.id });
      // Os avisos ficam no modal, e não no banner de 5 segundos: era ali que a
      // falha do Zen sumia, coberta pela mensagem "Guia emitida." logo depois.
      const avs: string[] = j.avisos ?? [];
      setAvisosEmissao(avs);
      if (comZen && j.zen && avs.length === 0) onAviso("Guia emitida e publicada no Zen e no Tareffa.");
      else if (!comZen) onAviso("Guia emitida.");
      onMudou();
    } catch {
      setErro("Falha de rede ao emitir.");
    } finally {
      setEmitindo(false);
    }
  }

  const podeEmitir = temChaveSefaz && !!calculo && !calculo.incompleta && !emitindo
    && (!precisaEndereco || (endereco.trim() !== "" && cidade.trim() !== ""));

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal larga" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="tk-crumbs">
              {debito.competencia} · {NOME_IMPOSTO[debito.codigoimposto] ?? debito.codigoimposto}
              {debito.cnpj ? ` · ${formatCNPJ(debito.cnpj)}` : ""}
            </div>
            <h2>{debito.nome ?? `Empresa #${debito.codigoempresa}`}</h2>
          </div>
          <button className="btn icon" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        <div className="modal-body">
          {erro && <div className="banner error">{erro}</div>}
          {avisosEmissao.map((m, i) => <div key={i} className="banner error">{m}</div>)}
          {debito.guias.length > 0 && (
            <>
              <h3>Guias já emitidas ({debito.guias.length})</h3>
              <ul className="dare-guias">
                {debito.guias.map((g) => (
                  <li key={g.id}>
                    <span>{formatDataHora(g.emitida_em)}</span>
                    <strong>R$ {formatBRL(g.total)}</strong>
                    <span className="nota">pagamento {dataBR(g.data_pagamento)}</span>
                    {g.zen_documento_id && (g.tareffa_documento_id
                      ? <span className="badge badge-soft">no Tareffa</span>
                      : <button className="btn" disabled={reenviando === g.id} onClick={async () => {
                          setReenviando(g.id);
                          const r = await fetch("/api/fiscal/dare-sp/tareffa", {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ guia_id: g.id }),
                          });
                          const j = await r.json().catch(() => ({}));
                          setReenviando(null);
                          if (r.ok) onAviso("Publicada no Tareffa.");
                          else setAvisosEmissao([`Não foi para o Tareffa: ${j.error ?? `HTTP ${r.status}`}`]);
                          onMudou();
                        }}>{reenviando === g.id ? "Enviando…" : "Enviar ao Tareffa"}</button>)}
                    {g.zen_documento_id && !g.tareffa_documento_id && g.tareffa_erro && (
                      <span className="dare-zen-erro">Tareffa: {g.tareffa_erro}</span>
                    )}
                    {g.zen_documento_id
                      ? <span className="badge badge-soft">no Zen</span>
                      : temTokenZen
                        ? <button className="btn" onClick={async () => {
                            setReenviando(g.id);
                            const r = await fetch("/api/fiscal/dare-sp/zen", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ guia_id: g.id }),
                            });
                            const j = await r.json().catch(() => ({}));
                            if (r.ok && j.falhaTareffa) setAvisosEmissao([`Publicada no Zen, mas não foi para o Tareffa: ${j.falhaTareffa}`]);
                            else if (r.ok) onAviso(j.semAtributos ? "Publicada no Zen e no Tareffa, sem vencimento e valor no Zen." : "Publicada no Zen e no Tareffa.");
                            else setAvisosEmissao([`Não subiu para o Zen: ${j.error ?? `HTTP ${r.status}`}`]);
                            setReenviando(null);
                            onMudou();
                          }} disabled={reenviando === g.id}>
                            {reenviando === g.id ? "Enviando…" : g.zen_erro ? "Tentar de novo no Zen" : "Enviar ao Zen"}
                          </button>
                        : null}
                    {!g.zen_documento_id && g.zen_erro && (
                      <span className="dare-zen-erro">Zen recusou: {g.zen_erro}</span>
                    )}
                    <a className="btn" href={`/api/fiscal/dare-sp/pdf?id=${g.id}`} target="_blank" rel="noopener noreferrer">PDF</a>
                    <button className="btn dare-excluir" disabled={reenviando === g.id} onClick={async () => {
                      const aviso = g.zen_documento_id
                        ? "\n\nEla já está no Zen: o documento de lá NÃO é apagado, exclua no Edoc também."
                        : "";
                      if (!window.confirm(`Excluir a guia de R$ ${formatBRL(g.total)} emitida em ${formatDataHora(g.emitida_em)}?${aviso}\n\nA guia não é cancelada na Sefaz: se não for paga, só vence.`)) return;
                      setReenviando(g.id);
                      const r = await fetch(`/api/fiscal/dare-sp/guia?id=${g.id}`, { method: "DELETE" });
                      const j = await r.json().catch(() => ({}));
                      setReenviando(null);
                      if (r.ok) onAviso("Guia excluída.");
                      else setAvisosEmissao([`Não excluiu: ${j.error ?? `HTTP ${r.status}`}`]);
                      onMudou();
                    }}>Excluir</button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="form-linha">
            <label className="campo-inline">
              <span>Vencimento do débito</span>
              <input type="date" value={vencimento}
                     onChange={(e) => {
                       const v = e.target.value;
                       setVencimento(v);
                       if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v > pagamento) setPagamento(v);
                     }} onBlur={guardarVencimento} />
            </label>
            <label className="campo-inline">
              <span>Data de pagamento</span>
              <input type="date" value={pagamento} min={hoje()}
                     onChange={(e) => setPagamento(e.target.value)} />
            </label>
            <label className="campo-inline">
              <span>Regime</span>
              <select className="sel" value={regime} onChange={(e) => setRegime(e.target.value as Regime)}>
                <option value="simples">Simples Nacional</option>
                <option value="rpa">RPA (regime periódico)</option>
              </select>
            </label>
          </div>

          <h3>Cálculo</h3>
          {previa && <p className="nota">Calculando…</p>}
          {calculo && (
            <>
              <div className="medicao">
                <div className="med">
                  <div className="k">Imposto</div>
                  <div className="v">R$ {formatBRL(calculo.principal)}</div>
                </div>
                <div className="med">
                  <div className="k">Multa</div>
                  <div className="v">R$ {formatBRL(calculo.multa.valor)}</div>
                  <div className="ajuda">{calculo.multa.percentual}% — {calculo.multa.descricao}</div>
                </div>
                <div className="med">
                  <div className="k">Juros</div>
                  <div className="v">R$ {formatBRL(calculo.juros.valor)}</div>
                  <div className="ajuda">{calculo.juros.percentual}%</div>
                </div>
                <div className="med destaque">
                  <div className="k">Total da guia</div>
                  <div className="v">R$ {formatBRL(calculo.total)}</div>
                </div>
              </div>

              <p className="nota">
                <strong>Memória:</strong> {calculo.juros.memoria}
              </p>

              {calculo.incompleta && (
                <div className="banner error">{calculo.impedimento}</div>
              )}
            </>
          )}

          {receita && (
            <>
              <h3>Receita</h3>
              <p className="nota">
                <strong>{receita.codigo}</strong> — {receita.nome}. A sugestão vem do código do
                imposto cruzado com o regime; guia paga na receita errada é mais difícil de
                desfazer do que guia recusada.
              </p>
            </>
          )}

          {precisaEndereco && (
            <>
              <h3>Endereço do contribuinte</h3>
              <p className="nota">
                A Sefaz exige endereço e cidade para emitir, e esse dado não vem da Questor.
                Fica guardado: nas próximas guias desta empresa já vem preenchido.
              </p>
              <div className="form-linha">
                <label className="campo-inline larga">
                  <span>Endereço</span>
                  <input value={endereco} onChange={(e) => setEndereco(e.target.value)}
                         placeholder="Rua, número, bairro" />
                </label>
                <label className="campo-inline">
                  <span>Cidade</span>
                  <input value={cidade} onChange={(e) => setCidade(e.target.value)} />
                </label>
                <label className="campo-inline">
                  <span>Telefone</span>
                  <input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
                </label>
              </div>
            </>
          )}

          {resultado && (
            <>
              <h3>Guia emitida</h3>
              <div className="dare-resultado">
                {resultado.numeroControle && (
                  <p className="nota">Controle <strong>{resultado.numeroControle}</strong></p>
                )}
                {resultado.linhaDigitavel && (
                  <div className="dare-linha">
                    <code>{resultado.linhaDigitavel}</code>
                    <button className="btn" onClick={() => navigator.clipboard?.writeText(resultado.linhaDigitavel!)}>
                      Copiar
                    </button>
                  </div>
                )}
                {resultado.pix && (
                  <div className="dare-linha">
                    <code className="dare-pix">{resultado.pix}</code>
                    <button className="btn" onClick={() => navigator.clipboard?.writeText(resultado.pix!)}>
                      Copiar PIX
                    </button>
                  </div>
                )}
                {resultado.id && (
                  <a className="btn" href={`/api/fiscal/dare-sp/pdf?id=${resultado.id}`} target="_blank" rel="noopener noreferrer">
                    Abrir PDF ↗
                  </a>
                )}
              </div>
            </>
          )}

        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onFechar}>Fechar</button>
          <button className="btn" disabled={!podeEmitir} onClick={() => emitir(false)}>
            {emitindo ? "Emitindo…" : "Gerar guia"}
          </button>
          <button className="btn primary" disabled={!podeEmitir || !temTokenZen} onClick={() => emitir(true)}
                  title={temTokenZen ? "Emite e sobe o PDF para o Edoc" : "Token do Questor Zen não configurado"}>
            Gerar guia e enviar ao Zen
          </button>
        </div>
      </div>
    </div>
  );
}
