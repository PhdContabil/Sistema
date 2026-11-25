"use client";

// Fiscal › Notas Fiscais: NFS-e de clientes do Simples Nacional (ME/EPP) pelo Portal
// Nacional, com o certificado da PHD e a procuração eletrônica do cliente. Depois de
// emitir, lança a nota no Questor. Usa os mesmos componentes visuais do Sistema MEI.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import catalogo from "@/lib/nfse/catalogo-nfse.json";
import { st, Campo, Tabela, Modal, brl, dt, fmtDoc } from "../mei/ui";

interface Empresa {
  codigoempresa: number; nome: string; cnpj: string; im: string; municipio: string; uf: string; cep: string;
  regime: string; ativa: boolean; ativMunic: string; cTribNacSugerido: string;
  simples: { ok: boolean; aliquota: number | null; competencia: string | null; motivo?: string };
}
interface EmpresaLista { codigoempresa: number; nome: string; cnpj: string; regime: string; municipio: string; uf: string }
const ehMei = (r: string) => /MICRO\s*EMPREENDEDOR|\bMEI\b/i.test(r);
const ehSimples = (r: string) => /MICROEMPRESA|PEQUENO PORTE/i.test(r) && !ehMei(r);
const LIMITE = 300;

interface NotaEmitida {
  id: number; codigoempresa: number; cnpj: string; dcompet: string; valor: number; nnfse: string | null; chave_acesso: string | null;
  status: string; tomador_doc: string | null; tomador_nome: string | null; emitido_por: string | null; criado_em: string; ambiente: number;
  questor_ok: boolean | null; questor_erro: string | null;
}

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const novaIdem = (cod: number) => `fiscal-nfse-${cod}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function NotasFiscais() {
  const [lista, setLista] = useState<EmpresaLista[] | null>(null);
  const [filtro, setFiltro] = useState({ cod: "", nome: "", regime: "" });
  const [aplicado, setAplicado] = useState({ cod: "", nome: "", regime: "" });
  const [aberta, setAberta] = useState(false);
  const [emp, setEmp] = useState<Empresa | null>(null);
  const [notas, setNotas] = useState<NotaEmitida[]>([]);
  const [ambiente, setAmbiente] = useState(1);
  const [info, setInfo] = useState("");
  const [f, setF] = useState({ data: hoje(), valor: "", descricao: "", infoCompl: "", cTribNac: "", cTribMun: "", cNBS: "", tomadorDoc: "", tomadorNome: "" });
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
        const sug = j.empresa?.cTribNacSugerido || "";
        setF((x) => ({ ...x, cTribNac: sug, cNBS: SERV.get(sug)?.nbs[0] ?? "" }));
        setIdem(novaIdem(cod)); setEmitida(null); setErro("");
        setInfo("");
      }
    } catch (e) { setInfo(e instanceof Error ? e.message : "Falha ao buscar."); }
  }
  useEffect(() => {
    void carregar();
    fetch("/api/fiscal/nfse/empresas").then((r) => r.json()).then((j) => setLista(j.empresas ?? [])).catch(() => setLista([]));
  }, []);

  const regimes = Array.from(new Set((lista ?? []).map((e) => e.regime || "SEM REGIME"))).sort();
  const filtradas = (lista ?? []).filter((e) => {
    if (aplicado.cod && !String(e.codigoempresa).startsWith(aplicado.cod)) return false;
    if (aplicado.regime && (e.regime || "SEM REGIME") !== aplicado.regime) return false;
    if (aplicado.nome) {
      const t = aplicado.nome.toLowerCase(), d = aplicado.nome.replace(/\D/g, "");
      if (!e.nome.toLowerCase().includes(t) && !(d.length >= 3 && e.cnpj.includes(d))) return false;
    }
    return true;
  });

  function abrirEmissao(cod: number) {
    setEmp(null); setAberta(true);
    void carregar(cod);
  }
  function fecharEmissao() {
    setAberta(false); setEmp(null); setEmitida(null); setErro("");
    void carregar();
  }

  async function emitir() {
    if (!emp) return;
    setErro("");
    const valor = Number(f.valor.replace(/\./g, "").replace(",", "."));
    if (!valor || !f.data) { setErro("Informe a data e o valor."); return; }
    if (!f.descricao.trim()) { setErro("Descreva o serviço."); return; }
    if (f.cTribNac.replace(/\D/g, "").length !== 6) { setErro("Código de tributação nacional: 6 dígitos (ex.: 170101)."); return; }
    if (f.cNBS.replace(/\D/g, "").length !== 9) { setErro("Item da NBS: 9 dígitos (escolha na lista)."); return; }
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
        cTribNac: f.cTribNac, cTribMun: f.cTribMun || undefined, cNBS: f.cNBS, tomadorDoc: doc || null, tomadorNome: f.tomadorNome || null, idem,
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
          <input style={{ ...st.input, maxWidth: 140 }} placeholder="Cód. Questor" value={filtro.cod}
            onChange={(e) => setFiltro({ ...filtro, cod: e.target.value.replace(/\D/g, "") })} onKeyDown={(e) => { if (e.key === "Enter") setAplicado(filtro); }} />
          <input style={{ ...st.input, maxWidth: 320 }} placeholder="Nome ou CNPJ" value={filtro.nome}
            onChange={(e) => setFiltro({ ...filtro, nome: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") setAplicado(filtro); }} />
          <select style={{ ...st.input, maxWidth: 240 }} value={filtro.regime} onChange={(e) => { const f2 = { ...filtro, regime: e.target.value }; setFiltro(f2); setAplicado(f2); }}>
            <option value="">Todos os regimes</option>
            {regimes.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button style={st.btnP} onClick={() => setAplicado(filtro)}>Buscar</button>
          {(aplicado.cod || aplicado.nome || aplicado.regime) && <button style={st.btn} onClick={() => { const z = { cod: "", nome: "", regime: "" }; setFiltro(z); setAplicado(z); }}>Limpar</button>}
          {info && !aberta && <span style={st.mut}>{info}</span>}
        </div>
        {lista === null ? <p style={st.mut}>Carregando empresas do Questor…</p> : (
          <>
            <p style={{ ...st.mut, margin: "10px 0 6px" }}>{filtradas.length} empresa(s){filtradas.length > LIMITE ? ` — mostrando as ${LIMITE} primeiras; use os filtros` : ""}</p>
            <Tabela cab={["Cód.", "Empresa", "CNPJ", "Regime", "Município", ""]} linhas={filtradas.slice(0, LIMITE).map((e) => [
              e.codigoempresa, e.nome, fmtDoc(e.cnpj), e.regime || "SEM REGIME", e.municipio ? `${e.municipio}/${e.uf}` : "",
              ehSimples(e.regime)
                ? <button key="b" style={{ ...st.btnP, padding: "4px 10px" }} onClick={() => abrirEmissao(e.codigoempresa)}>Emitir nota</button>
                : <span key="b" style={st.mut}>{ehMei(e.regime) ? "MEI: Sistema MEI" : "só Simples, por ora"}</span>,
            ])} />
          </>
        )}
      </div>

      {aberta && (
        <Modal titulo={emp ? `Emitir NFS-e — ${emp.codigoempresa} - ${emp.nome}` : "Emitir NFS-e"} fechar={fecharEmissao} largura={820}>
          {!emp ? <p style={st.mut}>{info || "Buscando a empresa…"}</p> : (
            <>
              <p style={{ ...st.mut, marginTop: 0 }}>
                {fmtDoc(emp.cnpj)} · {emp.municipio}/{emp.uf} · IM {emp.im || "—"} · {emp.regime || "—"}
                {emp.simples.ok ? ` · Simples: alíquota efetiva ${String(emp.simples.aliquota).replace(".", ",")}% (${emp.simples.competencia})` : ""}
              </p>
              {!emp.ativa && <p style={{ color: "var(--div)" }}>Empresa inativa no Questor.</p>}
              {!emp.simples.ok && <p style={{ color: "var(--div)" }}>{emp.simples.motivo ?? "Só Simples Nacional por enquanto."}</p>}
            </>
          )}
      {emp && podeEmitir && (
        <div>
          <Secao titulo="Serviço">
            <div style={linha("1fr 1fr 1fr")}>
              <Campo label="Data *"><input type="date" style={st.input} value={f.data} max={hoje()} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
              <Campo label="Valor (R$) *"><input style={st.input} value={f.valor} placeholder="0,00" onChange={(e) => setF({ ...f, valor: e.target.value })} /></Campo>
              <Campo label="Cód. municipal"><input style={st.input} value={f.cTribMun} placeholder="Só se o município exigir" maxLength={3} onChange={(e) => setF({ ...f, cTribMun: e.target.value.replace(/\D/g, "") })} /></Campo>
            </div>
            <div style={linha("1fr")}>
              <Campo label="Código de tributação nacional *">
                <Busca valor={f.cTribNac} rotulo={rotuloServ} opcoes={opcoesServ}
                  escolher={(c) => setF((x) => ({ ...x, cTribNac: c, cNBS: SERV.get(c)?.nbs.includes(x.cNBS) ? x.cNBS : (SERV.get(c)?.nbs[0] ?? "") }))} placeholder="Digite o código ou o nome do serviço" />
              </Campo>
            </div>
            <div style={linha("1fr")}>
              <Campo label="Item da NBS *">
                <Busca valor={f.cNBS} rotulo={rotuloNbs} opcoes={(t) => opcoesNbs(t, f.cTribNac)}
                  escolher={(c) => setF((x) => ({ ...x, cNBS: c }))} placeholder="Digite o código ou o nome" />
              </Campo>
            </div>
          </Secao>

          <Secao titulo="Tomador" dica="Em branco = nota sem tomador">
            <div style={linha("1fr 2fr")}>
              <Campo label="CPF ou CNPJ"><input style={st.input} value={f.tomadorDoc} placeholder="Somente números" onChange={(e) => setF({ ...f, tomadorDoc: e.target.value })} /></Campo>
              <Campo label="Nome"><input style={st.input} value={f.tomadorNome} placeholder="Para CNPJ, vem da Receita" onChange={(e) => setF({ ...f, tomadorNome: e.target.value })} /></Campo>
            </div>
          </Secao>

          <Secao titulo="Descrição">
            <div style={linha("1fr")}>
              <Campo label="Descrição do serviço *"><textarea style={{ ...st.input, minHeight: 70, resize: "vertical" }} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Campo>
            </div>
            <div style={linha("1fr")}>
              <Campo label="Informações complementares"><textarea style={{ ...st.input, minHeight: 44, resize: "vertical" }} value={f.infoCompl} onChange={(e) => setF({ ...f, infoCompl: e.target.value })} /></Campo>
            </div>
          </Secao>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 6, paddingTop: 12, borderTop: "1px solid var(--line, rgba(127,127,127,.25))" }}>
            <span style={{ ...st.mut, fontSize: 12 }}>Simples Nacional · ISS no DAS · sem retenções</span>
            <div style={{ display: "flex", gap: 8 }}>
              {emitida && <button style={st.btn} onClick={novaNota}>Nova nota</button>}
              <button style={st.btnP} disabled={emitindo || !!emitida} onClick={emitir}>{emitindo ? "Emitindo no Portal Nacional…" : emitida ? "NFS-e emitida" : "Emitir NFS-e (Portal Nacional)"}</button>
            </div>
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
          {emp && notas.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Notas emitidas desta empresa</h3>
              <TabelaNotas notas={notas} lancar={lancar} lancando={lancando} msgLanc={msgLanc} />
            </div>
          )}
        </Modal>
      )}

      {!aberta && (
        <div style={st.card}>
          <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Últimas notas emitidas</h3>
          {notas.length === 0 ? <p style={st.mut}>Nenhuma nota emitida pelo Núcleo.</p> : <TabelaNotas notas={notas} lancar={lancar} lancando={lancando} msgLanc={msgLanc} />}
        </div>
      )}
    </div>
  );
}

function TabelaNotas({ notas, lancar, lancando, msgLanc }: { notas: NotaEmitida[]; lancar: (n: NotaEmitida) => void; lancando: number | null; msgLanc: Record<number, string> }) {
  return (
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
  );
}

// ---------- Catálogo oficial: lista de serviços (LC 116) e NBS (Anexo VIII) ----------
interface Serv { c: string; d: string; nbs: string[] }
const CAT = catalogo as { servicos: Serv[]; nbs: Record<string, string> };
const SERV = new Map(CAT.servicos.map((x) => [x.c, x]));
const fmtServ = (c: string) => `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4, 6)}`;
const fmtNbs = (c: string) => `${c.slice(0, 1)}.${c.slice(1, 5)}.${c.slice(5, 7)}.${c.slice(7, 9)}`;
const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const rotuloServ = (c: string) => (SERV.has(c) ? `${fmtServ(c)} - ${SERV.get(c)!.d}` : c);
const rotuloNbs = (c: string) => (CAT.nbs[c] ? `${fmtNbs(c)} - ${CAT.nbs[c]}` : c);
function bate(texto: string, codigo: string, desc: string) {
  const d = texto.replace(/\D/g, ""), t = semAcento(texto.trim());
  if (!t) return true;
  if (d && d.length === t.replace(/[\s.\-]/g, "").length) return codigo.startsWith(d);
  return semAcento(desc).includes(t) || codigo.startsWith(d || "#");
}
function opcoesServ(t: string) {
  return CAT.servicos.filter((x) => bate(t, x.c, x.d)).slice(0, 15).map((x) => x.c);
}
function opcoesNbs(t: string, cTribNac: string) {
  const ligados = SERV.get(cTribNac)?.nbs ?? [];
  const todos = [...ligados, ...Object.keys(CAT.nbs).filter((c) => !ligados.includes(c))];
  return todos.filter((c) => bate(t, c, CAT.nbs[c] ?? "")).slice(0, 15);
}

/** Campo com sugestões: digita parte do código ou do nome e escolhe na lista. */
function Busca({ valor, rotulo, opcoes, escolher, placeholder }: { valor: string; rotulo: (c: string) => string; opcoes: (t: string) => string[]; escolher: (c: string) => void; placeholder?: string }) {
  const [texto, setTexto] = useState<string | null>(null);
  const lista = useMemo(() => (texto === null ? [] : opcoes(texto)), [texto, opcoes]);
  return (
    <div style={{ position: "relative" }}>
      <input style={st.input} placeholder={placeholder} value={texto ?? (valor ? rotulo(valor) : "")}
        onFocus={() => setTexto("")} onChange={(e) => setTexto(e.target.value)}
        onBlur={() => setTimeout(() => setTexto(null), 150)}
        onKeyDown={(e) => { if (e.key === "Enter" && lista[0]) { e.preventDefault(); escolher(lista[0]); setTexto(null); } }} />
      {texto !== null && lista.length > 0 && (
        <div style={{ position: "absolute", zIndex: 60, left: 0, right: 0, top: "100%", maxHeight: 260, overflow: "auto", background: "var(--card, #fff)", border: "1px solid var(--line, #ccd)", borderRadius: 8, boxShadow: "0 6px 18px rgba(0,0,0,.15)" }}>
          {lista.map((c) => (
            <div key={c} onMouseDown={(e) => { e.preventDefault(); escolher(c); setTexto(null); }}
              style={{ padding: "6px 10px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--line, #eef)" }}>{rotulo(c)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

const linha = (colunas: string): CSSProperties => ({ display: "grid", gridTemplateColumns: colunas, gap: 12, marginBottom: 10 });

/** Bloco do formulário com título. */
function Secao({ titulo, dica, children }: { titulo: string; dica?: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0 0 8px", paddingBottom: 4, borderBottom: "1px solid var(--line, rgba(127,127,127,.25))" }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", opacity: 0.8 }}>{titulo}</span>
        {dica && <span style={{ ...st.mut, fontSize: 12 }}>{dica}</span>}
      </div>
      {children}
    </section>
  );
}
