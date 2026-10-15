"use client";

// Contrato de parceria (Lei Salão-Parceiro): modelo usado na plataforma do Sindicato e
// situação da homologação, por profissional. Aba "Parceria" da Ficha + relatório por salão.
import { useEffect, useState } from "react";
import { st, Tabela, Campo, Mensagem, SelectSalao, baixarCsv, imprimir, esc, dt, type Mei } from "./ui";

export const MODELOS_PARCERIA = [
  "CONTRATO DE PARCERIA (VERSÃO 1.0) - NORMA COLETIVA (46473.003589/2017-99)",
  "CONTRATO DE PARCERIA - MPT - 2013 (46736.002113/2014-50)",
  "CONTRATO PADRÃO - VERSÃO 1.02 (46473.003589/2017-99)",
  "CONTRATO - MODELO ERON ARAUJO",
  "CONTRATO - MODELO GRUPO PRANA",
  "CONTRATO - MODELO GUSTAVO VENDRAME",
  "CONTRATO - MODELO INSTITUTO BEDESCHI",
  "CONTRATO - MODELO NOVADÃO",
  "CONTRATO - MODELO SIMONE ZAGALLO",
  "CONTRATO - MODELO SPA DEIA",
  "PHD - MODELO DE CONTRATO PADRÃO",
];
export const SITUACOES_PARCERIA = ["Pendente", "Enviado", "Homologado", "Recusado", "Não se aplica"];

export interface Parceria {
  codigoempresa: number; modelo: string | null; situacao: string; protocolo: string | null;
  data_envio: string | null; data_homologacao: string | null; obs: string | null;
  atualizado_em?: string; atualizado_por?: string | null;
}

async function lerParcerias(cod?: number): Promise<Parceria[]> {
  const r = await fetch(`/api/mei/parceria${cod ? `?cod=${cod}` : ""}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `Erro ${r.status}`);
  return j.dados ?? [];
}

const vazio = (cod: number): Parceria => ({ codigoempresa: cod, modelo: "", situacao: "Pendente", protocolo: "", data_envio: "", data_homologacao: "", obs: "" });

/** Aba "Parceria" da Ficha do MEI. */
export function ParceriaFicha({ m }: { m: Mei }) {
  const [d, setD] = useState<Parceria | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    lerParcerias(m.cod).then((l) => setD(l[0] ?? vazio(m.cod))).catch((e) => { setD(vazio(m.cod)); setMsg({ ok: false, texto: e.message }); });
  }, [m.cod]);
  if (!d) return <div style={st.card}>Carregando…</div>;
  const set = (k: keyof Parceria, v: string) => setD({ ...d, [k]: v });
  async function salvar() {
    if (!d) return;
    setSalvando(true); setMsg(null);
    try {
      const r = await fetch("/api/mei/parceria", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `Erro ${r.status}`);
      setD(j.dados); setMsg({ ok: true, texto: "Parceria salva." });
    } catch (e) { setMsg({ ok: false, texto: e instanceof Error ? e.message : "Falha ao salvar." }); }
    finally { setSalvando(false); }
  }
  return (
    <div style={st.card}>
      <p style={st.mut}>Salão: <b>{m.salao || "—"}</b>. Modelo do contrato de parceria usado na plataforma do Sindicato e situação da homologação.</p>
      <div style={st.grid}>
        <Campo label="Modelo do contrato">
          <select style={st.input} value={d.modelo ?? ""} onChange={(e) => set("modelo", e.target.value)}>
            <option value="">— não informado —</option>
            {MODELOS_PARCERIA.map((x) => <option key={x} value={x}>{x}</option>)}
            {d.modelo && !MODELOS_PARCERIA.includes(d.modelo) && <option value={d.modelo}>{d.modelo}</option>}
          </select>
        </Campo>
        <Campo label="Situação da homologação">
          <select style={st.input} value={d.situacao} onChange={(e) => set("situacao", e.target.value)}>
            {SITUACOES_PARCERIA.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Campo>
        <Campo label="Protocolo (Sindicato)"><input style={st.input} value={d.protocolo ?? ""} onChange={(e) => set("protocolo", e.target.value)} /></Campo>
        <Campo label="Data de envio"><input type="date" style={st.input} value={d.data_envio ?? ""} onChange={(e) => set("data_envio", e.target.value)} /></Campo>
        <Campo label="Data da homologação"><input type="date" style={st.input} value={d.data_homologacao ?? ""} onChange={(e) => set("data_homologacao", e.target.value)} /></Campo>
      </div>
      <Campo label="Observação"><textarea style={{ ...st.input, width: "100%", minHeight: 70 }} value={d.obs ?? ""} onChange={(e) => set("obs", e.target.value)} /></Campo>
      <div style={{ ...st.bar, marginTop: 10 }}>
        <button style={st.btnP} disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar"}</button>
        <a style={{ ...st.btn, textDecoration: "none" }} href="https://homologa.probeleza.org.br/documentos" target="_blank" rel="noopener noreferrer">Abrir plataforma do Sindicato ↗</a>
        {d.atualizado_em && <span style={st.mut}>Atualizado em {new Date(d.atualizado_em).toLocaleString("pt-BR")}{d.atualizado_por ? ` por ${d.atualizado_por}` : ""}</span>}
      </div>
      <Mensagem msg={msg} />
    </div>
  );
}

/** Relatório: profissionais por salão com modelo e situação da homologação. */
export function RelatorioParceria({ mei, abrir }: { mei: Mei[]; abrir?: (m: Mei) => void }) {
  const [lista, setLista] = useState<Parceria[] | null>(null);
  const [erro, setErro] = useState("");
  const [sal, setSal] = useState("");
  const [sit, setSit] = useState("");
  const [mod, setMod] = useState("");
  useEffect(() => { lerParcerias().then(setLista).catch((e) => setErro(e.message)); }, []);
  const porCod = new Map((lista ?? []).map((p) => [p.codigoempresa, p]));
  const L = mei.filter((m) => m.ativo && (!sal || String(m.salaoCod) === sal)).map((m) => ({ m, p: porCod.get(m.cod) }))
    .filter(({ p }) => (!sit || (p?.situacao ?? "Pendente") === sit) && (!mod || (mod === "-" ? !p?.modelo : p?.modelo === mod)))
    .sort((a, b) => a.m.salao.localeCompare(b.m.salao) || a.m.cod - b.m.cod);
  const linha = ({ m, p }: { m: Mei; p?: Parceria }) => [m.salao, m.cod, m.razao, p?.modelo ?? "", p?.situacao ?? "Pendente", p?.protocolo ?? "", dt(p?.data_envio), dt(p?.data_homologacao)];
  function imp() {
    const html = `<table><tr><th>Salão</th><th>Cód.</th><th>Profissional</th><th>Modelo</th><th>Situação</th><th>Protocolo</th><th>Envio</th><th>Homologação</th></tr>${L.map((x) => `<tr>${linha(x).map((c) => `<td>${esc(String(c ?? ""))}</td>`).join("")}</tr>`).join("")}</table>`;
    imprimir("Contratos de parceria — modelo e homologação", html + `<p><b>Total: ${L.length}</b></p>`);
  }
  return (
    <div style={st.card}>
      <div style={st.bar}>
        <SelectSalao mei={mei} valor={sal} onChange={setSal} />
        <Campo label="Situação"><select style={st.input} value={sit} onChange={(e) => setSit(e.target.value)}><option value="">Todas</option>{SITUACOES_PARCERIA.map((x) => <option key={x}>{x}</option>)}</select></Campo>
        <Campo label="Modelo"><select style={{ ...st.input, maxWidth: 280 }} value={mod} onChange={(e) => setMod(e.target.value)}><option value="">Todos</option><option value="-">— sem modelo —</option>{MODELOS_PARCERIA.map((x) => <option key={x} value={x}>{x}</option>)}</select></Campo>
        <button style={st.btnP} onClick={imp}>Imprimir</button>
        <button style={st.btn} onClick={() => baixarCsv("parceria_sindicato.csv", ["Salão", "Cód.", "Profissional", "Modelo", "Situação", "Protocolo", "Envio", "Homologação"], L.map(linha))}>Exportar CSV</button>
        <span style={st.mut}>{lista === null ? "Carregando…" : `${L.length} profissional(is) ativo(s) · duplo clique na linha abre a Ficha`}</span>
      </div>
      <Mensagem msg={erro ? { ok: false, texto: erro } : null} />
      <Tabela cab={["Salão", "Cód.", "Profissional", "Modelo", "Situação", "Protocolo", "Envio", "Homologação"]} linhas={L.map(linha)} onLinha={abrir ? (i) => abrir(L[i].m) : undefined} />
    </div>
  );
}
