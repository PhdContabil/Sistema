"use client";

// Fiscal › Notas Fiscais › Consultar notas: NFS-e emitidas e recebidas da empresa,
// lidas na hora do Portal Nacional (procuração para a PHD). Nada fica guardado.
// Seleciona para exportar os XML (zip), abrir o PDF ou importar no Q-Drive do Zen.
import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { st, Campo, Tabela, Modal, brl, dt, fmtDoc } from "../mei/ui";

interface EmpresaCons { codigoempresa: number; nome: string; cnpj: string }
interface EmpresaLista { codigoempresa: number; nome: string; cnpj: string }
interface Nota {
  nsu: number; chave: string; numero: string; competencia: string; emissao: string;
  prestador_doc: string; prestador_nome: string; tomador_doc: string; tomador_nome: string;
  valor: number; descricao: string; tipo: "emitida" | "recebida"; cancelada: boolean; xml_gz: string;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function xmlDe(gz: string): Promise<string> {
  const bin = Uint8Array.from(atob(gz), (c) => c.charCodeAt(0));
  const fluxo = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(fluxo).text();
}
function baixar(nome: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Padrão: mês anterior inteiro. */
const mesAnterior = () => { const h = new Date(); return { de: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), ate: iso(new Date(h.getFullYear(), h.getMonth(), 0)) }; };
const nomeXml = (n: Nota) => `NFSe-${n.tipo}-${n.numero || n.chave.slice(-10)}-${n.chave}.xml`;

export default function ConsultaNotas() {
  const [empresas, setEmpresas] = useState<EmpresaCons[]>([]);
  const [lista, setLista] = useState<EmpresaLista[]>([]);
  const [cadAberto, setCadAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [emp, setEmp] = useState<EmpresaCons | null>(null);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [carregando, setCarregando] = useState("");
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState("");
  const [per, setPer] = useState({ campo: "competencia", ...mesAnterior() });
  /** Período da última consulta (o que está na tela). */
  const [perConsultado, setPerConsultado] = useState<typeof per | null>(null);
  const [f, setF] = useState({ tipo: "", texto: "", situacao: "validas" });

  const carregarEmpresas = () => fetch("/api/fiscal/nfse/consulta?acao=empresas").then((r) => r.json()).then((j) => setEmpresas(j.empresas ?? [])).catch(() => setEmpresas([]));
  useEffect(() => { void carregarEmpresas(); }, []);
  useEffect(() => {
    if (cadAberto && !lista.length) fetch("/api/fiscal/nfse/empresas").then((r) => r.json()).then((j) => setLista(j.empresas ?? [])).catch(() => setLista([]));
  }, [cadAberto, lista.length]);

  async function cadastrar(e: EmpresaLista) {
    setErro("");
    const r = await fetch("/api/fiscal/nfse/consulta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "cadastrar", ...e }) });
    const j = await r.json();
    if (!r.ok) { setErro(j.error ?? "Falha ao cadastrar."); return; }
    setEmpresas(j.empresas ?? []); setCadAberto(false); setBusca("");
  }
  async function remover(e: EmpresaCons) {
    if (!confirm(`Tirar ${e.nome} da consulta de notas?`)) return;
    const r = await fetch("/api/fiscal/nfse/consulta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "remover", codigoempresa: e.codigoempresa }) });
    const j = await r.json();
    if (r.ok) { setEmpresas(j.empresas ?? []); if (emp?.codigoempresa === e.codigoempresa) { setEmp(null); setNotas([]); } }
  }

  function escolher(e: EmpresaCons) { setEmp(e); setNotas([]); setPerConsultado(null); setSel(new Set()); setErro(""); setMsg(""); }

  async function consultar() {
    const e = emp;
    if (!e) return;
    if (!per.de || !per.ate || per.de > per.ate) { setErro("Informe o período (De e Até)."); return; }
    setPerConsultado(per); setNotas([]); setSel(new Set()); setErro(""); setMsg("");
    const todas: Nota[] = []; const canc = new Set<string>();
    let nsu = 0;
    try {
      for (let volta = 0; volta < 40; volta++) {
        setCarregando(`Lendo o Portal Nacional… ${todas.length} nota(s)`);
        const r = await fetch(`/api/fiscal/nfse/consulta?cnpj=${e.cnpj}&nsu=${nsu}&ate=${per.ate}`);
        const j = await r.json();
        if (!r.ok) { setErro(j.error ?? `Erro ${r.status}`); break; }
        todas.push(...(j.notas as Nota[]));
        (j.canceladas as string[]).forEach((c) => canc.add(c.replace(/\D/g, "")));
        setNotas(todas.map((n) => ({ ...n, cancelada: canc.has(n.chave) })));
        if (!j.incompleto) break;
        nsu = j.proximoNsu;
      }
    } catch (x) { setErro(x instanceof Error ? x.message : "Falha na consulta."); }
    finally { setCarregando(""); }
  }

  const filtradas = useMemo(() => notas.filter((n) => {
    if (f.tipo && n.tipo !== f.tipo) return false;
    if (f.situacao === "validas" && n.cancelada) return false;
    if (f.situacao === "canceladas" && !n.cancelada) return false;
    if (perConsultado) {
      const ref = perConsultado.campo === "emissao" ? n.emissao : n.competencia;
      if (ref < perConsultado.de || ref > perConsultado.ate) return false;
    }
    const t = semAcento(f.texto.trim()), d = f.texto.replace(/\D/g, "");
    if (t && !(semAcento(n.prestador_nome).includes(t) || semAcento(n.tomador_nome).includes(t) || semAcento(n.descricao).includes(t)
      || (d.length >= 3 && (n.prestador_doc.includes(d) || n.tomador_doc.includes(d) || n.numero === d)))) return false;
    return true;
  }).sort((a, b) => (b.emissao + b.numero).localeCompare(a.emissao + a.numero)), [notas, f, perConsultado]);

  const soma = (L: Nota[]) => L.reduce((a, n) => a + Number(n.valor || 0), 0);
  const emi = filtradas.filter((n) => n.tipo === "emitida" && !n.cancelada), rec = filtradas.filter((n) => n.tipo === "recebida" && !n.cancelada);
  const canceladas = filtradas.filter((n) => n.cancelada);
  const selecionadas = filtradas.filter((n) => sel.has(n.chave));
  const todasMarcadas = filtradas.length > 0 && filtradas.every((n) => sel.has(n.chave));
  const marcar = (c: string) => setSel((s) => { const x = new Set(s); if (x.has(c)) x.delete(c); else x.add(c); return x; });
  const marcarTodas = () => setSel(todasMarcadas ? new Set() : new Set(filtradas.map((n) => n.chave)));

  async function exportarXml(L: Nota[]) {
    if (!L.length) return;
    setOcupado("xml");
    try {
      if (L.length === 1) { baixar(nomeXml(L[0]), new Blob([await xmlDe(L[0].xml_gz)], { type: "text/xml" })); return; }
      const zip = new JSZip();
      for (const n of L) zip.file(nomeXml(n), await xmlDe(n.xml_gz));
      baixar(`NFSe-${emp?.cnpj ?? ""}-${L.length}-notas.zip`, await zip.generateAsync({ type: "blob" }));
    } catch (x) { setErro(x instanceof Error ? x.message : "Falha ao exportar."); }
    finally { setOcupado(""); }
  }
  async function abrirPdf(n: Nota) {
    setOcupado(`pdf-${n.chave}`); setErro("");
    try {
      const r = await fetch("/api/fiscal/nfse/consulta/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave: n.chave, xml_gz: n.xml_gz }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErro(j.error ?? `Erro ${r.status}`); return; }
      window.open(URL.createObjectURL(await r.blob()), "_blank");
    } finally { setOcupado(""); }
  }
  async function enviarZen(L: Nota[]) {
    const validas = L.filter((n) => !n.cancelada);
    if (!validas.length || !confirm(`Importar ${validas.length} NFS-e no Q-Drive do Questor Zen (emitidas como saída, recebidas como entrada)?${L.length > validas.length ? `\n\n${L.length - validas.length} cancelada(s) fica(m) de fora.` : ""}`)) return;
    setOcupado("zen"); setErro(""); setMsg("");
    let ok = 0; const falhas: string[] = [];
    try {
      for (let i = 0; i < validas.length; i += 20) {
        setMsg(`Enviando ao Zen… ${Math.min(i + 20, validas.length)} de ${validas.length}`);
        const lote = validas.slice(i, i + 20).map((n) => ({ chave: n.chave, numero: n.numero, tipo: n.tipo, xml_gz: n.xml_gz }));
        const r = await fetch("/api/fiscal/nfse/consulta/zen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itens: lote }) });
        const j = await r.json();
        if (!r.ok) { setErro(j.error ?? `Erro ${r.status}`); break; }
        for (const x of j.resultados as { chave: string; ok: boolean; mensagem?: string }[]) {
          if (x.ok) ok++; else falhas.push(`${validas.find((n) => n.chave === x.chave)?.numero ?? x.chave}: ${x.mensagem}`);
        }
      }
      setMsg(`Q-Drive: ${ok} nota(s) importada(s)${falhas.length ? `, ${falhas.length} com erro — ${falhas.slice(0, 3).join(" · ")}${falhas.length > 3 ? " …" : ""}` : ""}.`);
    } catch (x) { setErro(x instanceof Error ? x.message : "Falha ao enviar."); }
    finally { setOcupado(""); }
  }

  const card = (titulo: string, qtd: number, valor: number, cor: string) => (
    <div style={{ ...st.card, marginBottom: 0, borderLeft: `4px solid ${cor}` }}>
      <div style={{ ...st.mut, fontSize: 12, textTransform: "uppercase" }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor }}>{brl(valor)}</div>
      <div style={st.mut}>{qtd} nota(s)</div>
    </div>
  );
  const tt = semAcento(busca.trim()), dd = busca.replace(/\D/g, "");
  const opcoes = lista.filter((e) => !empresas.some((x) => x.codigoempresa === e.codigoempresa))
    .filter((e) => !tt || String(e.codigoempresa) === dd || semAcento(e.nome).includes(tt) || (dd.length >= 4 && e.cnpj.includes(dd))).slice(0, 30);

  return (
    <div>
      <div style={st.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15, flex: 1 }}>Empresas para consulta</h3>
          <button style={st.btnP} onClick={() => setCadAberto(true)}>+ Cadastrar empresa</button>
        </div>
        <Tabela cab={["Cód.", "Empresa", "CNPJ", ""]} linhas={empresas.map((e) => [
          e.codigoempresa, e.nome, fmtDoc(e.cnpj),
          <span key="a" style={{ display: "flex", gap: 6, whiteSpace: "nowrap" }}>
            <button style={{ ...(emp?.codigoempresa === e.codigoempresa ? st.btnP : st.btn), padding: "4px 10px" }} disabled={!!carregando} onClick={() => escolher(e)}>{emp?.codigoempresa === e.codigoempresa ? "Selecionada" : "Selecionar"}</button>
            <button style={{ ...st.btn, padding: "4px 10px" }} onClick={() => remover(e)}>Remover</button>
          </span>,
        ])} />
      </div>

      {emp && (
        <div style={st.card}>
          <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>{emp.codigoempresa} - {emp.nome} · {fmtDoc(emp.cnpj)}</h3>
          <div style={{ ...st.bar, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
            <Campo label="Período por"><select style={st.input} value={per.campo} onChange={(e) => setPer({ ...per, campo: e.target.value })}>
              <option value="competencia">Data de competência</option><option value="emissao">Data de emissão</option></select></Campo>
            <Campo label="Competência (atalho)"><input type="month" style={st.input} value={per.de.slice(0, 7) === per.ate.slice(0, 7) ? per.de.slice(0, 7) : ""}
              onChange={(e) => { const [a, m] = e.target.value.split("-").map(Number); if (a && m) setPer({ ...per, de: iso(new Date(a, m - 1, 1)), ate: iso(new Date(a, m, 0)) }); }} /></Campo>
            <Campo label="De"><input type="date" style={st.input} value={per.de} onChange={(e) => setPer({ ...per, de: e.target.value })} /></Campo>
            <Campo label="Até"><input type="date" style={st.input} value={per.ate} onChange={(e) => setPer({ ...per, ate: e.target.value })} /></Campo>
            <button style={st.btnP} disabled={!!carregando} onClick={consultar}>{carregando ? "Consultando…" : "Consultar"}</button>
          </div>
          {carregando && <p style={st.mut}>{carregando}</p>}
          {!perConsultado && !carregando && <p style={st.mut}>Escolha o período e clique em Consultar.</p>}
          {erro && <p style={{ color: "var(--div)" }}>{erro}</p>}
          {perConsultado && <>
          <p style={{ ...st.mut, margin: "10px 0" }}>Período consultado: {perConsultado.campo === "emissao" ? "emissão" : "competência"} de {dt(perConsultado.de)} a {dt(perConsultado.ate)}</p>
          <div style={{ ...st.grid, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {card("Emitidas", emi.length, soma(emi), "var(--ok)")}
            {card("Recebidas", rec.length, soma(rec), "var(--accent)")}
            {card("Canceladas", canceladas.length, soma(canceladas), "var(--div)")}
          </div>
          <div style={st.bar}>
            <Campo label="Tipo"><select style={st.input} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              <option value="">Emitidas e recebidas</option><option value="emitida">Emitidas</option><option value="recebida">Recebidas</option></select></Campo>
            <Campo label="Situação"><select style={st.input} value={f.situacao} onChange={(e) => setF({ ...f, situacao: e.target.value })}>
              <option value="validas">Válidas</option><option value="canceladas">Canceladas</option><option value="">Todas</option></select></Campo>
            <Campo label="Busca" largura={220}><input style={st.input} placeholder="Nome, CNPJ, nº, descrição" value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} /></Campo>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <span style={st.mut}>{filtradas.length} nota(s) · {selecionadas.length} selecionada(s)</span>
            <button style={st.btn} disabled={!selecionadas.length || !!ocupado} onClick={() => exportarXml(selecionadas)}>{ocupado === "xml" ? "Gerando…" : `Exportar XML (${selecionadas.length})`}</button>
            <button style={st.btn} disabled={!selecionadas.length || !!ocupado} onClick={() => enviarZen(selecionadas)}>{ocupado === "zen" ? "Enviando…" : `Enviar ao Zen / Q-Drive (${selecionadas.length})`}</button>
            {msg && <span style={{ ...st.mut, fontSize: 13 }}>{msg}</span>}
          </div>
          <Tabela cab={["", "Tipo", "Nº", "Competência", "Emissão", "Prestador", "Tomador", "Valor", ""]} linhas={[
            [<input key="t" type="checkbox" checked={todasMarcadas} onChange={marcarTodas} title="Marcar todas da lista" />, "", "", "", "", "", "", "", ""],
            ...filtradas.map((n) => [
              <input key="c" type="checkbox" checked={sel.has(n.chave)} onChange={() => marcar(n.chave)} />,
              <span key="tp" style={{ color: n.tipo === "emitida" ? "var(--ok)" : "var(--accent)" }}>{n.tipo === "emitida" ? "Emitida" : "Recebida"}</span>,
              <span key="n">{n.numero || "—"}{n.cancelada && <><br /><span style={{ color: "var(--div)", fontSize: 12 }}>CANCELADA</span></>}</span>,
              dt(n.competencia), dt(n.emissao),
              <span key="p">{n.prestador_nome}<br /><span style={st.mut}>{fmtDoc(n.prestador_doc)}</span></span>,
              <span key="to">{n.tomador_nome || "—"}{n.tomador_doc && <><br /><span style={st.mut}>{fmtDoc(n.tomador_doc)}</span></>}</span>,
              <span key="v" style={n.cancelada ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>{brl(n.valor)}</span>,
              <span key="a" style={{ display: "flex", gap: 6, whiteSpace: "nowrap" }}>
                <button style={{ ...st.btn, padding: "3px 8px" }} disabled={!!ocupado} onClick={() => abrirPdf(n)}>{ocupado === `pdf-${n.chave}` ? "Abrindo…" : "PDF"}</button>
                <button style={{ ...st.btn, padding: "3px 8px" }} disabled={!!ocupado} onClick={() => exportarXml([n])}>XML</button>
              </span>,
            ]),
          ]} />
          </>}
        </div>
      )}

      {cadAberto && (
        <Modal titulo="Cadastrar empresa para consulta de notas" fechar={() => setCadAberto(false)}>
          <Campo label="Buscar no cadastro de empresas"><input autoFocus style={st.input} placeholder="Código, nome ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} /></Campo>
          {!lista.length && <p style={st.mut}>Carregando empresas…</p>}
          <div style={{ marginTop: 10 }}>
            <Tabela cab={["Cód.", "Empresa", "CNPJ", ""]} linhas={opcoes.map((e) => [
              e.codigoempresa, e.nome, fmtDoc(e.cnpj),
              <button key="b" style={{ ...st.btnP, padding: "3px 10px" }} disabled={(e.cnpj ?? "").replace(/\D/g, "").length !== 14} onClick={() => cadastrar(e)}>Cadastrar</button>,
            ])} />
          </div>
          <p style={{ ...st.mut, fontSize: 12 }}>A consulta usa a procuração eletrônica do cliente para a PHD no Emissor Nacional. As notas não ficam guardadas no Núcleo.</p>
        </Modal>
      )}
    </div>
  );
}
