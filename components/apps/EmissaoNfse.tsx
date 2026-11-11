"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Emissão de NFS-e da PHD (porta do app phd_nfse). Tudo pela tela:
//   1. importar as RPS (CSV do nSQL; API do Questor quando existir);
//   2. marcar e emitir no Portal Nacional (Sefin) — uma por vez, a Sefin não
//      recebe lote; se uma falha, PARA e pergunta;
//   3. o PDF (DANFSe) sai do XML da nota e vai para o Zen logo após a emissão.

interface Nota {
  id: number; rps_serie: string; rps_numero: number; data_prestacao: string; valor: number;
  descricao: string; tomador: { cpf_cnpj: string; razao_social: string; email: string; municipio: string };
  problemas: string[]; status: string; erro: string | null; protocolo: string | null;
  numero_nota: string | null; link_pdf: string | null; pdf_ok: boolean;
  zen_documento_id: string | null; zen_erro: string | null; arquivo: string | null;
  origem: string; criado_em: string; emitido_em: string | null; emitido_por: string | null; questor_ok?: boolean;
}

/** Andamento ao vivo de cada nota durante o envio (uma por vez). */
type Andamento = { estado: "fila" | "enviando" | "aguardando" | "ok" | "erro" | "pulada"; texto?: string };
const ANDAMENTO: Record<Andamento["estado"], [string, string]> = {
  fila: ["Na fila", "badge-soft"], enviando: ["Enviando…", "sit-observar"], aguardando: ["Aguardando Sefin", "sit-observar"],
  ok: ["Enviada ✓", "sit-ok"], erro: ["Falhou", "sit-critico"], pulada: ["Marcada manual", "sit-observar"],
};
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

const ROTULO: Record<string, [string, string]> = {
  pendente: ["Pendente", "badge-soft"], emitindo: ["Emitindo…", "sit-observar"], emitida: ["Emitida", "sit-ok"],
  erro: ["Erro", "sit-critico"], manual: ["Manual", "sit-observar"], ignorada: ["Ignorada", "badge-soft"],
};
const INTERVALO_MS = 2000;           // pausa curta entre notas
const ESPERA_SEQUENCIA_MAX = 600_000; // 10 min esperando liberar a sequência

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** CSV do nSQL vem em Windows-1252; se for UTF-8 válido, usa UTF-8. */
async function lerArquivo(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1252").decode(buf); }
}

async function acao(id: number, nome: string) {
  const r = await fetch(`/api/financeiro/nfse/${id}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: nome }),
  });
  return r.json().catch(() => ({ error: `HTTP ${r.status}` }));
}

export default function EmissaoNfse() {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [cfg, setCfg] = useState({ credenciais: true, pTotTribSN: true, ambiente: 2, zen: true });
  const [filtro, setFiltro] = useState("abertas");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [pausa, setPausa] = useState<{ nota: Nota; erro: string } | null>(null);
  const [andamento, setAndamento] = useState<Record<number, Andamento>>({});
  const marcar = (id: number, a: Andamento) => setAndamento((m) => ({ ...m, [id]: a }));
  const [faixa, setFaixa] = useState({ rps_inicio: "", rps_fim: "", data_inicio: "", data_fim: "" });
  const [dataManual, setDataManual] = useState("");
  const decisao = useRef<((d: "repetir" | "manual" | "parar") => void) | null>(null);
  const parar = useRef(false);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/financeiro/nfse", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg({ ok: false, texto: j.error ?? "Falha ao carregar." }); return; }
    setNotas(j.notas ?? []); setCfg({ credenciais: !!j.credenciais, pTotTribSN: !!j.pTotTribSN, ambiente: Number(j.ambiente) || 2, zen: !!j.zen });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const visiveis = useMemo(() => notas.filter((n) =>
    filtro === "todas" ? true
      : filtro === "abertas" ? ["pendente", "erro", "emitindo"].includes(n.status)
      : filtro === "emitidas" ? ["emitida", "manual"].includes(n.status)
      : filtro === "sem-pdf" ? n.status === "emitida" && (!n.pdf_ok || (!n.zen_documento_id && cfg.zen))
      : n.status === filtro), [notas, filtro, cfg.zen]);

  const emitiveis = visiveis.filter((n) => ["pendente", "erro"].includes(n.status) && n.problemas.length === 0);
  const contagem = (f: (n: Nota) => boolean) => notas.filter(f).length;

  async function importarCsv(f: File) {
    setOcupado(true); setMsg(null);
    const texto = await lerArquivo(f);
    const r = await fetch("/api/financeiro/nfse", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "csv", texto, arquivo: f.name, data_manual: dataManual || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) { setMsg({ ok: false, texto: j.error ?? "Falha ao importar." }); return; }
    setMsg({ ok: true, texto: `${f.name}: ${j.gravadas} RPS importada(s)${j.comProblema ? `, ${j.comProblema} com problema` : ""}${j.jaEmitidas ? `, ${j.jaEmitidas} já emitida(s) (mantidas)` : ""}.` });
    setFiltro("abertas"); carregar();
  }

  async function buscarQuestor() {
    setOcupado(true); setMsg(null);
    const r = await fetch("/api/financeiro/nfse", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "questor", ...faixa, rps_inicio: Number(faixa.rps_inicio) || undefined, rps_fim: Number(faixa.rps_fim) || undefined, data_manual: dataManual || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) { setMsg({ ok: false, texto: j.error ?? "Falha ao buscar no Questor." }); return; }
    setMsg({ ok: true, texto: `${j.gravadas} RPS vieram do Questor${j.comProblema ? `, ${j.comProblema} com problema` : ""}.` });
    carregar();
  }

  /** Para o lote e pergunta o que fazer (como o app Python). */
  function perguntar(nota: Nota, erro: string) {
    return new Promise<"repetir" | "manual" | "parar">((resolve) => {
      setPausa({ nota, erro });
      decisao.current = (d) => { setPausa(null); decisao.current = null; resolve(d); };
    });
  }

  async function emitirSelecionadas() {
    const fila = notas.filter((n) => sel.has(n.id)).sort((a, b) => a.rps_numero - b.rps_numero);
    if (fila.length === 0) return;
    if (!window.confirm(`Emitir ${fila.length} nota(s) no Portal Nacional${cfg.ambiente === 1 ? " (PRODUÇÃO)" : " (TESTE - produção restrita)"}, da RPS ${fila[0].rps_numero} à ${fila[fila.length - 1].rps_numero}?\n\nIsso gera NFS-e de verdade.`)) return;
    setOcupado(true); setMsg(null); parar.current = false;
    setAndamento(Object.fromEntries(fila.map((n) => [n.id, { estado: "fila" } as Andamento])));
    let feitas = 0;
    for (let i = 0; i < fila.length && !parar.current; i++) {
      const n = fila[i];
      const inicio = Date.now();
      let tentativa = 0;
      for (;;) {
        setProgresso(`Enviando RPS ${n.rps_numero} (${i + 1} de ${fila.length})${tentativa ? ` — tentativa ${tentativa}` : ""}…`);
        marcar(n.id, tentativa ? { estado: "aguardando", texto: `tentativa ${tentativa}` } : { estado: "enviando" });
        const r = await acao(n.id, "emitir");
        if (r.ok) { feitas++; marcar(n.id, { estado: "ok", texto: [r.numero ? `NFS-e ${r.numero}` : "", r.pdf].filter(Boolean).join(" · ") }); break; }
        if (r.aguardar && Date.now() - inicio < ESPERA_SEQUENCIA_MAX && !parar.current) {
          tentativa++;
          await esperar(Math.min(5000 * tentativa, 60000));
          continue;
        }
        marcar(n.id, { estado: "erro", texto: r.erro ?? r.error });
        const d = await perguntar(n, r.erro ?? r.error ?? "Falha.");
        if (d === "repetir") { tentativa = 0; continue; }
        if (d === "manual") { await acao(n.id, "manual"); marcar(n.id, { estado: "pulada" }); break; }
        parar.current = true; break;
      }
      await carregar();
      if (i < fila.length - 1 && !parar.current) await esperar(INTERVALO_MS);
    }
    setProgresso(null); setOcupado(false); setSel(new Set());
    setAndamento((m) => Object.fromEntries(Object.entries(m).filter(([, a]) => a.estado !== "fila")));
    setMsg({ ok: true, texto: `${feitas} nota(s) emitida(s). O PDF e o Zen já foram feitos em cada nota; o que falhou aparece em "Sem PDF/Zen".` });
    carregar();
  }

  async function baixarPdfs() {
    const fila = notas.filter((n) => n.status === "emitida" && (!n.pdf_ok || (!n.zen_documento_id && cfg.zen)))
      .sort((a, b) => a.rps_numero - b.rps_numero);
    if (fila.length === 0) { setMsg({ ok: true, texto: "Nenhuma nota esperando PDF ou Zen." }); return; }
    setOcupado(true); setMsg(null);
    const cont = { ok: 0, pendente: 0, erro: 0 };
    for (let i = 0; i < fila.length; i++) {
      setProgresso(`PDF da RPS ${fila[i].rps_numero} (${i + 1} de ${fila.length})…`);
      const r = await acao(fila[i].id, "pdf");
      if (r.status === "ok") cont.ok++; else if (r.status === "pendente" || r.status === "manutencao") cont.pendente++; else cont.erro++;
      if (r.status === "manutencao") break;
    }
    setProgresso(null); setOcupado(false);
    setMsg({ ok: cont.erro === 0, texto: `${cont.ok} PDF(s) ok${cont.pendente ? `, ${cont.pendente} ainda sem XML na Sefin (tente em alguns minutos)` : ""}${cont.erro ? `, ${cont.erro} com erro (veja na lista)` : ""}.` });
    carregar();
  }

  async function porNota(n: Nota, nome: string) {
    if (nome === "manual" && !window.confirm(`Marcar a RPS ${n.rps_numero} como emitida manualmente no portal?`)) return;
    const r = await acao(n.id, nome);
    if (r.error || r.erro) setMsg({ ok: false, texto: r.error ?? r.erro });
    else if (r.mensagem) setMsg({ ok: r.status === "ok", texto: r.mensagem });
    carregar();
  }

  const todasMarcadas = emitiveis.length > 0 && emitiveis.every((n) => sel.has(n.id));

  return (
    <>
      <div className={`banner ${cfg.ambiente === 1 ? "" : "error"}`}>
        Portal Nacional de NFS-e — ambiente <strong>{cfg.ambiente === 1 ? "PRODUÇÃO" : "PRODUÇÃO RESTRITA (teste, sem valor fiscal)"}</strong>.
        {cfg.ambiente !== 1 && <> Para valer, defina <strong>NFSE_AMBIENTE=producao</strong> na Vercel.</>}
      </div>
      {!cfg.credenciais && (
        <div className="banner error">
          Falta o certificado A1 da PHD na Vercel: <strong>NFSE_CERT_PFX_B64</strong> (o .pfx em base64) e <strong>NFSE_CERT_SENHA</strong>.
          Sem ele dá para importar e conferir, mas não emitir.
        </div>
      )}
      {!cfg.pTotTribSN && <div className="banner error">Falta <strong>NFSE_PTOT_TRIB_SN</strong> na Vercel: o % aproximado de tributos do Simples que vai na nota.</div>}
      {!cfg.zen && <div className="banner">Token do Zen não configurado: os PDFs não serão publicados no Edoc.</div>}
      {msg && <div className={`banner ${msg.ok ? "" : "error"}`}>{msg.texto}</div>}
      {progresso && <div className="banner">{progresso} <button className="btn" onClick={() => { parar.current = true; }}>Parar depois desta</button></div>}

      {pausa && (
        <div className="banner error nfse-pausa">
          <strong>O lote parou na RPS {pausa.nota.rps_numero} ({pausa.nota.tomador.razao_social}).</strong>
          <div style={{ margin: "6px 0" }}>{pausa.erro}</div>
          <div className="fp-acoes">
            <button className="btn primary" onClick={() => decisao.current?.("repetir")}>Corrigi, tentar de novo</button>
            <button className="btn" onClick={() => decisao.current?.("manual")}>Emiti no portal: marcar manual e seguir</button>
            <button className="btn" onClick={() => decisao.current?.("parar")}>Parar o lote</button>
          </div>
        </div>
      )}

      <section className="bloco-edit">
        <h3>1. Importar RPS</h3>
        <div className="nfse-import">
          <label className="btn">
            Enviar CSV do nSQL
            <input type="file" accept=".csv,text/csv" hidden disabled={ocupado}
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) importarCsv(f); e.target.value = ""; }} />
          </label>
          <span className="sub-info">ou buscar no Questor:</span>
          <input className="search" style={{ width: 90 }} placeholder="RPS de" value={faixa.rps_inicio} onChange={(e) => setFaixa({ ...faixa, rps_inicio: e.target.value })} />
          <input className="search" style={{ width: 90 }} placeholder="até" value={faixa.rps_fim} onChange={(e) => setFaixa({ ...faixa, rps_fim: e.target.value })} />
          <input className="search" type="date" value={faixa.data_inicio} onChange={(e) => setFaixa({ ...faixa, data_inicio: e.target.value })} title="Prestação de" />
          <input className="search" type="date" value={faixa.data_fim} onChange={(e) => setFaixa({ ...faixa, data_fim: e.target.value })} title="até" />
          <button className="btn" disabled={ocupado} onClick={buscarQuestor}>Buscar no Questor</button>
        </div>
        <div className="nfse-import" style={{ marginTop: 10 }}>
          <span className="sub-info"><strong>Data de prestação / competência</strong> (opcional, exceção do mês atual):</span>
          <input className="search" type="date" value={dataManual} max={new Date().toISOString().slice(0, 10)}
                 onChange={(e) => setDataManual(e.target.value)} title="Vale para todas as RPS importadas agora" />
          {dataManual && <button className="btn" onClick={() => setDataManual("")}>Usar a data do Questor</button>}
        </div>
        <p className="sub-info">
          Se preencher a data, ela substitui a do Questor em todas as RPS desta importação (dá para ajustar uma a uma na lista).
          Reimportar é seguro: RPS já emitida não é tocada.
        </p>
      </section>

      <section className="bloco-edit" style={{ marginTop: 16 }}>
        <div className="nfse-barra">
          <div className="nfse-filtros">
            {[["abertas", `A emitir (${contagem((n) => ["pendente", "erro", "emitindo"].includes(n.status))})`],
              ["sem-pdf", `Sem PDF/Zen (${contagem((n) => n.status === "emitida" && (!n.pdf_ok || (!n.zen_documento_id && cfg.zen)))})`],
              ["emitidas", `Emitidas (${contagem((n) => ["emitida", "manual"].includes(n.status))})`],
              ["ignorada", "Ignoradas"], ["todas", "Todas"]].map(([id, rot]) => (
              <button key={id} className={`btn${filtro === id ? " primary" : ""}`} onClick={() => setFiltro(id)}>{rot}</button>
            ))}
          </div>
          <div className="fp-acoes">
            <button className="btn primary" disabled={ocupado || sel.size === 0 || !cfg.credenciais || !cfg.pTotTribSN} onClick={emitirSelecionadas}>
              2. Emitir selecionadas ({sel.size})
            </button>
            <button className="btn" disabled={ocupado} onClick={baixarPdfs}>Refazer PDF/Zen pendentes</button>
          </div>
        </div>

        <div className="table-wrap" style={{ boxShadow: "none" }}>
          <table className="grid nfse-tabela">
            <thead>
              <tr>
                <th className="c-res">
                  <input type="checkbox" checked={todasMarcadas} disabled={emitiveis.length === 0}
                         onChange={() => setSel(todasMarcadas ? new Set() : new Set(emitiveis.map((n) => n.id)))} />
                </th>
                <th>RPS</th>
                <th>Prestação</th>
                <th className="col-empresa">Tomador</th>
                <th className="num">Valor</th>
                <th className="c-res">Situação</th>
                <th>Histórico</th>
                <th>NFS-e / Zen</th>
                <th className="c-res">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 && <tr><td colSpan={9} className="vazio">Nada aqui. Importe o CSV do nSQL para começar.</td></tr>}
              {visiveis.map((n) => {
                const [rot, cls] = ROTULO[n.status] ?? [n.status, "badge-soft"];
                const marcavel = ["pendente", "erro"].includes(n.status) && n.problemas.length === 0;
                return (
                  <tr key={n.id}>
                    <td className="c-res">
                      <input type="checkbox" disabled={!marcavel || ocupado} checked={sel.has(n.id)}
                             onChange={() => setSel((s) => { const x = new Set(s); if (x.has(n.id)) x.delete(n.id); else x.add(n.id); return x; })} />
                    </td>
                    <td className="mono">{n.rps_serie}-{n.rps_numero}</td>
                    <td>
                      {["pendente", "erro", "ignorada"].includes(n.status) ? (
                        <input className="search nfse-data" type="date" value={n.data_prestacao} disabled={ocupado}
                               max={new Date().toISOString().slice(0, 10)}
                               onChange={async (e) => {
                                 const r = await fetch(`/api/financeiro/nfse/${n.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "data", data: e.target.value }) });
                                 const j = await r.json().catch(() => ({}));
                                 if (!r.ok || j.error) setMsg({ ok: false, texto: j.error ?? "Falha ao mudar a data." });
                                 carregar();
                               }} />
                      ) : dataBR(n.data_prestacao)}
                    </td>
                    <td className="col-empresa">
                      <span className="emp-nome">{n.tomador.razao_social}</span>
                      <span className="obs">{n.tomador.cpf_cnpj} · {n.tomador.municipio}{n.tomador.email ? ` · ${n.tomador.email}` : ""}</span>
                      {n.problemas.length > 0 && <span className="obs nfse-erro">{n.problemas.join(" · ")}</span>}
                      {n.erro && n.status !== "emitida" && <span className="obs nfse-erro">{n.erro}</span>}
                    </td>
                    <td className="num">{brl(n.valor)}</td>
                    <td className="c-res">
                      {andamento[n.id] ? (
                        <>
                          <span className={`badge ${ANDAMENTO[andamento[n.id].estado][1]}`}>{ANDAMENTO[andamento[n.id].estado][0]}</span>
                          {andamento[n.id].texto && <span className="obs">{andamento[n.id].texto}</span>}
                        </>
                      ) : <span className={`badge ${cls}`}>{rot}</span>}
                    </td>
                    <td className="nfse-hist">
                      <span className="obs">Sincronizada {dataHora(n.criado_em)} ({n.origem === "questor" ? "Questor" : "CSV"})</span>
                      {n.emitido_em && <span className="obs">{n.status === "manual" ? "Manual" : "Enviada ao Portal Nacional"} {dataHora(n.emitido_em)}{n.emitido_por ? ` por ${n.emitido_por.split("@")[0]}` : ""}</span>}
                      {n.pdf_ok && <span className="obs">PDF baixado</span>}
                      {n.questor_ok && <span className="obs nfse-ok">Número gravado no Questor</span>}
                    </td>
                    <td>
                      {n.numero_nota ? <span>NFS-e <strong>{n.numero_nota}</strong></span> : n.protocolo ? <span className="obs">protocolo {n.protocolo}</span> : <span className="dash">–</span>}
                      {n.status === "emitida" && <> · <a href={`/api/financeiro/nfse/${n.id}`} target="_blank" rel="noopener noreferrer">PDF</a></>}
                      {n.zen_documento_id && <span className="obs nfse-ok">no Zen</span>}
                      {n.zen_erro && !n.zen_documento_id && <span className="obs nfse-erro">Zen: {n.zen_erro}</span>}
                    </td>
                    <td className="c-res nfse-acoes">
                      {["emitida", "manual"].includes(n.status) && (!n.pdf_ok || !n.zen_documento_id) && (
                        <button className="btn" disabled={ocupado} onClick={() => porNota(n, "pdf")}>PDF/Zen</button>
                      )}
                      {["pendente", "erro"].includes(n.status) && (
                        <>
                          {n.problemas.length === 0 && cfg.credenciais && (
                            <button className="btn" disabled={ocupado} onClick={() => porNota(n, "verificar")} title="Confere dados, IBGE e certificado sem emitir">Conferir</button>
                          )}
                          <button className="btn" disabled={ocupado} onClick={() => porNota(n, "manual")} title="Emitida direto no portal">Manual</button>
                          <button className="btn" disabled={ocupado} onClick={() => porNota(n, "ignorar")} title="Não emitir">Ignorar</button>
                        </>
                      )}
                      {n.status === "ignorada" && <button className="btn" onClick={() => porNota(n, "voltar")}>Voltar</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="sub-info" style={{ marginTop: 8 }}>
          Envio uma a uma no Portal Nacional (o número da DPS é o da RPS). Se uma nota falhar, o lote para e pergunta.
          Para cancelar uma NFS-e já emitida, use o Emissor Nacional (www.nfse.gov.br).
        </p>
      </section>
    </>
  );
}
