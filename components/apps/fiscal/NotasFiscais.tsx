"use client";

// Fiscal › Notas Fiscais: NFS-e de clientes do Simples Nacional (ME/EPP) pelo Portal
// Nacional, com o certificado da PHD e a procuração eletrônica do cliente. Depois de
// emitir, lança a nota no Questor. Usa os mesmos componentes visuais do Sistema MEI.
import { useEffect, useState } from "react";
import { st, Campo, Tabela, brl, dt, fmtDoc } from "../mei/ui";

interface Empresa {
  codigoempresa: number; nome: string; cnpj: string; im: string; municipio: string; uf: string; cep: string;
  regime: string; ativa: boolean; ativMunic: string; cTribNacSugerido: string;
  simples: { ok: boolean; aliquota: number | null; competencia: string | null; motivo?: string };
}
interface NotaEmitida {
  id: number; codigoempresa: number; cnpj: string; dcompet: string; valor: number; nnfse: string | null; chave_acesso: string | null;
  status: string; tomador_doc: string | null; tomador_nome: string | null; emitido_por: string | null; criado_em: string; ambiente: number;
  questor_ok: boolean | null; questor_erro: string | null;
}

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const novaIdem = (cod: number) => `fiscal-nfse-${cod}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function NotasFiscais() {
  const [codTxt, setCodTxt] = useState("");
  const [emp, setEmp] = useState<Empresa | null>(null);
  const [notas, setNotas] = useState<NotaEmitida[]>([]);
  const [ambiente, setAmbiente] = useState(1);
  const [info, setInfo] = useState("");
  const [f, setF] = useState({ data: hoje(), valor: "", descricao: "", infoCompl: "", cTribNac: "", cTribMun: "", tomadorDoc: "", tomadorNome: "" });
  const [idem, setIdem] = useState("");
  const [erro, setErro] = useState("");
  const [emitindo, setEmitindo] = useState(false);
  const [emitida, setEmitida] = useState<{ id: number; chave: string; numero: string | null; ja?: boolean } | null>(null);
  const [lancando, setLancando] = useState<number | null>(null);
  const [msgLanc, setMsgLanc] = useState<Record<number, string>>({});

  async function carregar(cod?: number) {
    setInfo(cod ? "Buscando a empresa…" : "");
    try {
      const r = await fetch(`/api/fiscal/nfse${cod ? `?cod=${cod}` : ""}`);
      const j = await r.json();
      if (!r.ok) { setInfo(j.error ?? `Erro ${r.status}`); return; }
      setAmbiente(j.ambiente ?? 1);
      setNotas(j.notas ?? []);
      if (cod) {
        setEmp(j.empresa);
        setF((x) => ({ ...x, cTribNac: j.empresa?.cTribNacSugerido || "" }));
        setIdem(novaIdem(cod)); setEmitida(null); setErro("");
        setInfo("");
      }
    } catch (e) { setInfo(e instanceof Error ? e.message : "Falha ao buscar."); }
  }
  useEffect(() => { void carregar(); }, []);

  async function emitir() {
    if (!emp) return;
    setErro("");
    const valor = Number(f.valor.replace(/\./g, "").replace(",", "."));
    if (!valor || !f.data) { setErro("Informe a data e o valor."); return; }
    if (!f.descricao.trim()) { setErro("Descreva o serviço."); return; }
    if (f.cTribNac.replace(/\D/g, "").length !== 6) { setErro("Código de tributação nacional: 6 dígitos (ex.: 170101)."); return; }
    const doc = f.tomadorDoc.replace(/\D/g, "");
    if (doc && ![11, 14].includes(doc.length)) { setErro("Tomador: CPF (11 números) ou CNPJ (14 números), ou deixe em branco."); return; }
    if (doc.length === 11 && !f.tomadorNome.trim()) { setErro("Informe o nome do tomador (CPF)."); return; }
    const tom = doc ? `${f.tomadorNome || "(nome pela Receita)"} (${fmtDoc(doc)})` : "sem tomador (consumidor não identificado)";
    if (!confirm(`Você está logado como PHD CONTABIL LTDA (11.274.011/0001-86), mas representando ${emp.nome} (${fmtDoc(emp.cnpj)}).\n\n`
      + `Esta NFS-e será gerada tendo ${emp.nome} como emitente.\nData ${dt(f.data)} · Valor ${brl(valor)} · Tomador: ${tom}`
      + `${ambiente === 2 ? "\n\nAMBIENTE DE TESTE (produção restrita): a nota não vale." : ""}\n\nDeseja confirmar a emissão?`)) return;
    setEmitindo(true);
    try {
      const r = await fetch("/api/fiscal/nfse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        codigoempresa: emp.codigoempresa, data: f.data, valor, descricao: f.descricao, infoCompl: f.infoCompl,
        cTribNac: f.cTribNac, cTribMun: f.cTribMun || undefined, tomadorDoc: doc || null, tomadorNome: f.tomadorNome || null, idem,
      }) });
      const j = await r.json();
      if (!j.ok) { setErro(j.erro ?? j.error ?? `Erro ${r.status}`); return; }
      setEmitida({ id: j.id, chave: j.chave, numero: j.numero, ja: j.ja_emitida });
      await carregar(emp.codigoempresa).then(() => setEmitida({ id: j.id, chave: j.chave, numero: j.numero, ja: j.ja_emitida }));
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao emitir."); }
    finally { setEmitindo(false); }
  }

  function novaNota() {
    if (!emp) return;
    setEmitida(null); setErro(""); setIdem(novaIdem(emp.codigoempresa));
    setF((x) => ({ ...x, valor: "", tomadorDoc: "", tomadorNome: "", infoCompl: "" }));
  }

  async function lancar(n: NotaEmitida) {
    if (!confirm(`Lançar no Questor a NFS-e nº ${n.nnfse} de ${dt(n.dcompet)}, valor ${brl(Number(n.valor))}?`)) return;
    setLancando(n.id);
    try {
      const r = await fetch("/api/fiscal/nfse/lancar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: n.id }) });
      const j = await r.json();
      setMsgLanc((m) => ({ ...m, [n.id]: j.mensagem ?? j.error ?? `Erro ${r.status}` }));
      if (j.ok) setNotas((L) => L.map((x) => (x.id === n.id ? { ...x, questor_ok: true, questor_erro: null } : x)));
    } catch (e) { setMsgLanc((m) => ({ ...m, [n.id]: e instanceof Error ? e.message : "Falha." })); }
    finally { setLancando(null); }
  }

  const podeEmitir = !!emp && emp.ativa && emp.simples.ok;

  return (
    <div>
      {ambiente === 2 && <div style={{ ...st.aviso, color: "var(--div)" }}>Ambiente de TESTE (produção restrita): as notas não valem.</div>}
      <div style={st.card}>
        <div style={st.bar}>
          <input style={{ ...st.input, maxWidth: 160 }} placeholder="Código da empresa" value={codTxt}
            onChange={(e) => setCodTxt(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter" && codTxt) void carregar(Number(codTxt)); }} />
          <button style={st.btnP} disabled={!codTxt} onClick={() => carregar(Number(codTxt))}>Buscar</button>
          {info && <span style={st.mut}>{info}</span>}
        </div>
        {emp && (
          <div style={{ marginTop: 10 }}>
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{emp.codigoempresa} - {emp.nome} · {fmtDoc(emp.cnpj)}</p>
            <p style={{ ...st.mut, margin: 0 }}>
              {emp.municipio}/{emp.uf} · IM {emp.im || "—"} · Regime: {emp.regime || "—"}
              {emp.simples.ok ? ` · Simples: alíquota efetiva ${String(emp.simples.aliquota).replace(".", ",")}% (${emp.simples.competencia})` : ""}
              {emp.ativMunic ? ` · Atividade municipal: ${emp.ativMunic}` : ""}
            </p>
            {!emp.ativa && <p style={{ color: "var(--div)" }}>Empresa inativa no Questor.</p>}
            {!emp.simples.ok && <p style={{ color: "var(--div)" }}>{emp.simples.motivo ?? "Só Simples Nacional por enquanto."}</p>}
          </div>
        )}
      </div>

      {emp && podeEmitir && (
        <div style={st.card}>
          <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Nova NFS-e</h3>
          <div style={st.grid}>
            <Campo label="Data (competência) *"><input type="date" style={st.input} value={f.data} max={hoje()} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
            <Campo label="Valor *"><input style={st.input} value={f.valor} placeholder="0,00" onChange={(e) => setF({ ...f, valor: e.target.value })} /></Campo>
            <Campo label="Cód. tributação nacional * (6 dígitos)"><input style={st.input} value={f.cTribNac} placeholder="ex.: 170101" maxLength={8} onChange={(e) => setF({ ...f, cTribNac: e.target.value.replace(/\D/g, "") })} /></Campo>
            <Campo label="Cód. tributação municipal (só se o município exigir)"><input style={st.input} value={f.cTribMun} placeholder="3 dígitos" maxLength={3} onChange={(e) => setF({ ...f, cTribMun: e.target.value.replace(/\D/g, "") })} /></Campo>
            <Campo label="Tomador — CPF/CNPJ (em branco = sem tomador)"><input style={st.input} value={f.tomadorDoc} onChange={(e) => setF({ ...f, tomadorDoc: e.target.value })} /></Campo>
            <Campo label="Nome do tomador (obrigatório para CPF)"><input style={st.input} value={f.tomadorNome} placeholder="CNPJ: vem da Receita" onChange={(e) => setF({ ...f, tomadorNome: e.target.value })} /></Campo>
          </div>
          <Campo label="Descrição do serviço *"><textarea style={{ ...st.input, minHeight: 70 }} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Campo>
          <Campo label="Informações complementares"><textarea style={{ ...st.input, minHeight: 40 }} value={f.infoCompl} onChange={(e) => setF({ ...f, infoCompl: e.target.value })} /></Campo>
          <p style={st.mut}>Simples Nacional (ME/EPP), ISS dentro do DAS, sem retenções. O % aproximado de tributos sai da alíquota efetiva do Simples no Questor.</p>
          <div style={{ ...st.bar, marginTop: 10 }}>
            <button style={st.btnP} disabled={emitindo || !!emitida} onClick={emitir}>{emitindo ? "Emitindo no Portal Nacional…" : emitida ? "NFS-e emitida" : "Emitir NFS-e (Portal Nacional)"}</button>
            {emitida && <button style={st.btn} onClick={novaNota}>Nova nota</button>}
          </div>
          {erro && <p style={{ color: "var(--div)" }}>{erro}</p>}
          {emitida && (
            <div style={{ ...st.card, marginTop: 10 }}>
              <p style={{ margin: "0 0 6px", fontWeight: 600, color: "var(--ok)" }}>{emitida.ja ? "Esta nota já tinha sido emitida" : "NFS-e emitida"}{ambiente === 2 ? " (TESTE — não vale)" : ""}: nº {emitida.numero ?? "—"}</p>
              <p style={{ ...st.mut, margin: "2px 0" }}>Chave de acesso: {emitida.chave}</p>
              <p style={{ margin: "6px 0 0" }}><a href={`/api/fiscal/nfse/pdf?chave=${emitida.chave}`} target="_blank" rel="noreferrer">Abrir PDF da nota</a> · lance no Questor na lista abaixo.</p>
            </div>
          )}
        </div>
      )}

      <div style={st.card}>
        <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>{emp ? `Notas emitidas — ${emp.codigoempresa}` : "Últimas notas emitidas"}</h3>
        {notas.length === 0 ? <p style={st.mut}>Nenhuma nota emitida pelo Núcleo.</p> : (
          <Tabela cab={["Empresa", "Data", "Nº NFS-e", "Tomador", "Valor", "Emitida por", "PDF", "Questor"]} linhas={notas.map((n) => [
            n.codigoempresa, dt(n.dcompet), n.status === "incerta" ? "sem resposta — confira no portal" : (n.nnfse ?? "—"),
            n.tomador_nome ? `${n.tomador_nome}${n.tomador_doc ? ` (${fmtDoc(n.tomador_doc)})` : ""}` : "Sem tomador",
            brl(Number(n.valor)), n.emitido_por ?? "",
            n.chave_acesso ? <a key="p" href={`/api/fiscal/nfse/pdf?chave=${n.chave_acesso}`} target="_blank" rel="noreferrer">PDF</a> : "",
            n.status !== "emitida" ? "" : n.questor_ok ? <span key="q" style={{ color: "var(--ok)" }}>lançada</span> : (
              <span key="q">
                <button style={{ ...st.btn, padding: "3px 8px" }} disabled={lancando === n.id} onClick={() => lancar(n)}>{lancando === n.id ? "Lançando…" : "Lançar no Questor"}</button>
                {(msgLanc[n.id] || n.questor_erro) && <><br /><span style={{ ...st.mut, color: "var(--div)" }}>{msgLanc[n.id] || n.questor_erro}</span></>}
              </span>
            ),
          ])} />
        )}
      </div>
    </div>
  );
}
