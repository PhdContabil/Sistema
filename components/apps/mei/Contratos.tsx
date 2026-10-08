"use client";

// Contratos PHD = controlecontrato + gerarcontrato + contratoservico + contratoservicoeditar +
// modelocontratos + ajudavariaveis + relatórios contrato/contratoimprimir.
import { useCallback, useEffect, useState } from "react";
import { ler, st, Tabela, Campo, Mensagem, Modal, dt, hojeISO, imprimir, esc } from "./ui";

interface Modelo { codigo: number; modelo: string; conteudo: string; ativo: boolean }
interface Contrato { codigo: number; codigoempresa: number; codigoestab: number; codigosocio: number | null; modelo_codigo: number | null; contrato: string; data_emissao: string | null; data_inicio: string | null; data_assinado: string | null }

const VARIAVEIS = ["@nomecliente", "@tipologradouro", "@endereco", "@numendereco", "@complemento", "@bairro", "@cidade", "@estado", "@cep", "@inscrfederal",
  "@nomesocio", "@dddsocio", "@fonesocio", "@emailsocio", "@socioinscrfederal", "@datacontrato", "@valor1", "@n2valor", "@n3valor", "@valorextenso", "@2valorextenso", "@3valorextenso"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

async function contratosApi<T>(tipo: "modelos" | "contratos", query: Record<string, string> = {}): Promise<T[]> {
  const r = await fetch(`/api/mei/contratos?${new URLSearchParams({ tipo, ...query })}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j.dados;
}
async function gravar(tipo: "modelos" | "contratos", acao: "criar" | "alterar" | "excluir", dados: Record<string, unknown>, codigo?: number) {
  const r = await fetch("/api/mei/contratos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, acao, dados, codigo }) });
  const j = await r.json();
  if (!r.ok) return { ok: false, texto: j.error as string };
  return { ok: true, texto: j.simulacao ? "SIMULAÇÃO: a trava de gravação está ligada, nada foi salvo." : "Salvo.", simulacao: !!j.simulacao };
}

/** Valor por extenso em reais (função Extenso do Access). */
export function extenso(valor: number): string {
  const u = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const d = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const c = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  const ate999 = (n: number): string => {
    if (n === 0) return "";
    if (n === 100) return "cem";
    const partes: string[] = [];
    if (n >= 100) partes.push(c[Math.floor(n / 100)]);
    const r = n % 100;
    if (r >= 20) { partes.push(d[Math.floor(r / 10)]); if (r % 10) partes.push(u[r % 10]); } else if (r) partes.push(u[r]);
    return partes.join(" e ");
  };
  const inteiro = Math.floor(valor);
  const centavos = Math.round((valor - inteiro) * 100);
  const grupos: [number, string, string][] = [[1e6, "milhão", "milhões"], [1e3, "mil", "mil"], [1, "", ""]];
  const out: string[] = [];
  let resto = inteiro;
  for (const [base, s1, sN] of grupos) {
    const n = Math.floor(resto / base);
    resto %= base;
    if (!n) continue;
    out.push(base === 1e3 && n === 1 ? "mil" : `${ate999(n)}${s1 ? " " + (n === 1 ? s1 : sN) : ""}`);
  }
  let txt = out.join(out.length > 1 && (inteiro % 1000 < 100 || inteiro % 100 === 0) ? " e " : ", ");
  if (inteiro) txt += inteiro === 1 ? " real" : (inteiro % 1e6 === 0 ? " de reais" : " reais");
  if (centavos) txt += `${inteiro ? " e " : ""}${ate999(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`;
  return txt || "zero real";
}

const moeda = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Contratos() {
  const [aba, setAba] = useState<"contratos" | "modelos">("contratos");
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button style={aba === "contratos" ? st.btnP : st.btn} onClick={() => setAba("contratos")}>Contratos</button>
        <button style={aba === "modelos" ? st.btnP : st.btn} onClick={() => setAba("modelos")}>Modelos</button>
      </div>
      {aba === "contratos" ? <ListaContratos /> : <Modelos />}
    </div>
  );
}

function ListaContratos() {
  const [de, setDe] = useState("2021-01-01");
  const [ate, setAte] = useState(hojeISO());
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<Contrato[]>([]);
  const [nomes, setNomes] = useState<Record<number, string>>({});
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [novo, setNovo] = useState(false);
  const [ed, setEd] = useState<Contrato | null>(null);

  const carregar = useCallback(() => {
    setErro("");
    contratosApi<Contrato>("contratos", { de, ate }).then(async (L) => {
      setLista(L);
      const n: Record<number, string> = {};
      for (const c of [...new Set(L.map((x) => x.codigoempresa))]) {
        try { const j = await ler<{ dados: { nomeestab?: string; nomeempresa?: string }[] }>("/empresas/cadastro", { codigoempresa: c, apenas_ativas: false }); n[c] = j.dados?.[0]?.nomeestab ?? j.dados?.[0]?.nomeempresa ?? ""; } catch { /* sem nome */ }
      }
      setNomes(n);
    }).catch((e) => setErro(e.message));
  }, [de, ate]);
  useEffect(() => { carregar(); }, [carregar]);

  const L = lista.filter((c) => (nomes[c.codigoempresa] ?? "").toLowerCase().includes(q.toLowerCase()));
  async function excluir(c: Contrato) {
    if (!confirm(`Excluir o contrato ${c.codigo}?`)) return;
    const r = await gravar("contratos", "excluir", {}, c.codigo);
    setMsg(r); if (r.ok && !r.simulacao) carregar();
  }
  return (
    <div style={st.card}>
      <div style={st.bar}>
        <Campo label="Pesquisar empresa"><input style={st.input} value={q} onChange={(e) => setQ(e.target.value)} /></Campo>
        <Campo label="Início de"><input type="date" style={st.input} value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
        <Campo label="Até"><input type="date" style={st.input} value={ate} onChange={(e) => setAte(e.target.value)} /></Campo>
        <button style={st.btnP} onClick={() => setNovo(true)}>Novo contrato</button>
      </div>
      {erro && <div style={{ ...st.aviso, color: "var(--div)" }}>{erro}</div>}
      <Mensagem msg={msg} />
      <Tabela cab={["Código", "Empresa", "Filial", "Emissão", "Início", "Status", ""]}
        linhas={L.map((c) => [c.codigo, `${c.codigoempresa} - ${nomes[c.codigoempresa] ?? ""}`, c.codigoestab, dt(c.data_emissao), dt(c.data_inicio), c.data_assinado ? "Assinado" : "",
          <span key="b" style={{ display: "flex", gap: 6 }}>
            <button style={st.btn} onClick={() => setEd(c)}>Editar</button>
            <button style={st.btn} onClick={() => imprimir(`Contrato ${c.codigo}`, c.contrato)}>Imprimir</button>
            <button style={st.btnD} onClick={() => excluir(c)}>Excluir</button>
          </span>])} />
      {novo && <GerarContrato fechar={() => setNovo(false)} aoSalvar={carregar} />}
      {ed && <EditarContrato c={ed} nome={nomes[ed.codigoempresa] ?? ""} fechar={() => setEd(null)} aoSalvar={carregar} />}
    </div>
  );
}

interface Estab { codigoempresa: number; codigoestab: number; nomeestab: string; tipologradouro?: string; enderecoestab?: string; numenderestab?: number | string; complenderestab?: string; bairroenderestab?: string; nomemunic?: string; siglaestado?: string; cependerestab?: string; inscrfederal?: string; socios?: Socio[] }
interface Socio { codigosocio: number; nomesocio: string; inscrfederal?: string; dddcelular?: string; numerocelular?: string; dddfone?: string; numerofone?: string; email?: string }

function GerarContrato({ fechar, aoSalvar }: { fechar: () => void; aoSalvar: () => void }) {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [p, setP] = useState({ codigoempresa: "", codigoestab: "1", codigosocio: "1", data_inicio: hojeISO(), valor1: "0", valor2: "0", valor3: "0", modelo: "" });
  const [estabs, setEstabs] = useState<Estab[]>([]);
  const [texto, setTexto] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => { contratosApi<Modelo>("modelos").then(setModelos).catch((e) => setMsg({ ok: false, texto: e.message })); }, []);
  useEffect(() => {
    if (!p.codigoempresa) { setEstabs([]); return; }
    const t = setTimeout(() => ler<{ dados: Estab[] }>("/empresas/cadastro", { codigoempresa: p.codigoempresa, apenas_ativas: false, detalhado: true }).then((j) => setEstabs(j.dados ?? [])).catch(() => setEstabs([])), 400);
    return () => clearTimeout(t);
  }, [p.codigoempresa]);
  const estab = estabs.find((e) => String(e.codigoestab) === p.codigoestab) ?? estabs[0];
  const socio = estab?.socios?.find((s) => String(s.codigosocio) === p.codigosocio);

  function gerar() {
    const mod = modelos.find((m) => String(m.codigo) === p.modelo);
    if (!estab || !mod) { setMsg({ ok: false, texto: "Escolha empresa, filial e modelo." }); return; }
    const v = (s: string) => Number(s.replace(",", ".")) || 0;
    const [ano, mes, dia] = p.data_inicio.split("-");
    const mapa: Record<string, string> = {
      "@nomecliente": estab.nomeestab, "@tipologradouro": estab.tipologradouro ?? "", "@endereco": estab.enderecoestab ?? "", "@numendereco": String(estab.numenderestab ?? ""),
      "@complemento": estab.complenderestab ?? "", "@bairro": estab.bairroenderestab ?? "", "@cidade": estab.nomemunic ?? "", "@estado": estab.siglaestado ?? "",
      "@cep": estab.cependerestab ?? "", "@inscrfederal": estab.inscrfederal ?? "",
      "@nomesocio": socio?.nomesocio ?? "", "@socioinscrfederal": socio?.inscrfederal ?? "", "@dddsocio": socio?.dddcelular ?? socio?.dddfone ?? "",
      "@fonesocio": socio?.numerocelular ?? socio?.numerofone ?? "", "@emailsocio": socio?.email ?? "",
      "@datacontrato": `${Number(dia)} de ${MESES[Number(mes) - 1]} de ${ano}`,
      "@valorextenso": extenso(v(p.valor1)), "@2valorextenso": extenso(v(p.valor2)), "@3valorextenso": extenso(v(p.valor3)),
      "@valor1": moeda(v(p.valor1)), "@n2valor": moeda(v(p.valor2)), "@n3valor": moeda(v(p.valor3)),
    };
    // Substitui as mais longas primeiro (@2valorextenso antes de @valor...).
    let t = mod.conteudo;
    for (const k of Object.keys(mapa).sort((a, b) => b.length - a.length)) t = t.split(k).join(esc(mapa[k]));
    setTexto(t);
  }
  async function salvar() {
    const r = await gravar("contratos", "criar", { codigoempresa: +p.codigoempresa, codigoestab: +p.codigoestab, codigosocio: +p.codigosocio || null, modelo_codigo: +p.modelo, contrato: texto, data_emissao: hojeISO(), data_inicio: p.data_inicio });
    setMsg(r); if (r.ok && !r.simulacao) { aoSalvar(); fechar(); }
  }
  return (
    <Modal titulo="Novo contrato" fechar={fechar} largura={900}>
      <div style={st.grid}>
        <Campo label="Cód. empresa (Questor)"><input style={st.input} value={p.codigoempresa} onChange={(e) => setP({ ...p, codigoempresa: e.target.value.replace(/\D/g, "") })} /></Campo>
        <Campo label="Filial"><select style={st.input} value={p.codigoestab} onChange={(e) => setP({ ...p, codigoestab: e.target.value })}>{estabs.map((e) => <option key={e.codigoestab} value={e.codigoestab}>{e.codigoestab} - {e.nomeestab}</option>)}</select></Campo>
        <Campo label="Sócio"><select style={st.input} value={p.codigosocio} onChange={(e) => setP({ ...p, codigosocio: e.target.value })}>{(estab?.socios ?? []).map((s) => <option key={s.codigosocio} value={s.codigosocio}>{s.codigosocio} - {s.nomesocio}</option>)}</select></Campo>
        <Campo label="Data de início"><input type="date" style={st.input} value={p.data_inicio} onChange={(e) => setP({ ...p, data_inicio: e.target.value })} /></Campo>
        <Campo label="Valor 1"><input style={st.input} value={p.valor1} onChange={(e) => setP({ ...p, valor1: e.target.value })} /></Campo>
        <Campo label="Valor 2"><input style={st.input} value={p.valor2} onChange={(e) => setP({ ...p, valor2: e.target.value })} /></Campo>
        <Campo label="Valor 3"><input style={st.input} value={p.valor3} onChange={(e) => setP({ ...p, valor3: e.target.value })} /></Campo>
        <Campo label="Modelo"><select style={st.input} value={p.modelo} onChange={(e) => setP({ ...p, modelo: e.target.value })}><option value="">Selecione…</option>{modelos.filter((m) => m.ativo).map((m) => <option key={m.codigo} value={m.codigo}>{m.modelo}</option>)}</select></Campo>
      </div>
      {estab && <p style={st.mut}>{estab.nomeestab} · {estab.inscrfederal}</p>}
      <button style={st.btnP} onClick={gerar}>Gerar</button>
      {texto && (
        <>
          <div contentEditable suppressContentEditableWarning onBlur={(e) => setTexto(e.currentTarget.innerHTML)} style={{ ...st.card, marginTop: 12, maxHeight: 420, overflow: "auto", background: "#fff", color: "#111" }} dangerouslySetInnerHTML={{ __html: texto }} />
          <div style={st.bar}><button style={st.btnP} onClick={salvar}>Salvar contrato</button><button style={st.btn} onClick={() => imprimir("Contrato", texto)}>Imprimir</button></div>
        </>
      )}
      <Mensagem msg={msg} />
    </Modal>
  );
}

function EditarContrato({ c, nome, fechar, aoSalvar }: { c: Contrato; nome: string; fechar: () => void; aoSalvar: () => void }) {
  const [d, setD] = useState({ contrato: c.contrato, data_emissao: c.data_emissao ?? "", data_inicio: c.data_inicio ?? "", data_assinado: c.data_assinado ?? "" });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  async function salvar() {
    const r = await gravar("contratos", "alterar", { ...d, data_emissao: d.data_emissao || null, data_inicio: d.data_inicio || null, data_assinado: d.data_assinado || null }, c.codigo);
    setMsg(r); if (r.ok && !r.simulacao) aoSalvar();
  }
  return (
    <Modal titulo={`Contrato ${c.codigo} — ${c.codigoempresa} ${nome}`} fechar={fechar} largura={900}>
      <div style={st.grid}>
        <Campo label="Emissão"><input type="date" style={st.input} value={d.data_emissao} onChange={(e) => setD({ ...d, data_emissao: e.target.value })} /></Campo>
        <Campo label="Início"><input type="date" style={st.input} value={d.data_inicio} onChange={(e) => setD({ ...d, data_inicio: e.target.value })} /></Campo>
        <Campo label="Assinado em"><input type="date" style={st.input} value={d.data_assinado} onChange={(e) => setD({ ...d, data_assinado: e.target.value })} /></Campo>
      </div>
      <div contentEditable suppressContentEditableWarning onBlur={(e) => setD({ ...d, contrato: e.currentTarget.innerHTML })} style={{ ...st.card, maxHeight: 460, overflow: "auto", background: "#fff", color: "#111" }} dangerouslySetInnerHTML={{ __html: c.contrato }} />
      <div style={st.bar}><button style={st.btnP} onClick={salvar}>Salvar</button><button style={st.btn} onClick={() => imprimir(`Contrato ${c.codigo}`, d.contrato)}>Imprimir</button></div>
      <Mensagem msg={msg} />
    </Modal>
  );
}

function Modelos() {
  const [lista, setLista] = useState<Modelo[]>([]);
  const [erro, setErro] = useState("");
  const [ed, setEd] = useState<Partial<Modelo> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ajuda, setAjuda] = useState(false);
  const carregar = useCallback(() => { contratosApi<Modelo>("modelos").then(setLista).catch((e) => setErro(e.message)); }, []);
  useEffect(() => { carregar(); }, [carregar]);
  async function salvar() {
    if (!ed?.modelo?.trim()) { setMsg({ ok: false, texto: "Informe o nome do modelo." }); return; }
    const r = await gravar("modelos", ed.codigo ? "alterar" : "criar", { modelo: ed.modelo, conteudo: ed.conteudo ?? "", ativo: ed.ativo !== false }, ed.codigo);
    setMsg(r); if (r.ok && !r.simulacao) { setEd(null); carregar(); }
  }
  return (
    <div style={st.card}>
      <div style={st.bar}>
        <button style={st.btnP} onClick={() => setEd({ modelo: "", conteudo: "", ativo: true })}>Novo modelo</button>
        <button style={st.btn} onClick={() => setAjuda(true)}>Ajuda (variáveis)</button>
      </div>
      {erro && <div style={{ ...st.aviso, color: "var(--div)" }}>{erro}</div>}
      <Mensagem msg={msg} />
      <Tabela cab={["Código", "Modelo", "Situação", ""]} linhas={lista.map((m) => [m.codigo, m.modelo, m.ativo ? "Ativo" : "Inativo", <button key="e" style={st.btn} onClick={() => setEd(m)}>Editar</button>])} />
      {ed && (
        <Modal titulo={ed.codigo ? `Modelo ${ed.codigo}` : "Novo modelo"} fechar={() => setEd(null)} largura={900}>
          <Campo label="Nome do modelo"><input style={st.input} value={ed.modelo ?? ""} onChange={(e) => setEd({ ...ed, modelo: e.target.value })} /></Campo>
          <p style={st.mut}>Texto (pode editar direto; use as variáveis @ da ajuda):</p>
          <div contentEditable suppressContentEditableWarning onBlur={(e) => setEd({ ...ed, conteudo: e.currentTarget.innerHTML })} style={{ ...st.card, minHeight: 200, maxHeight: 460, overflow: "auto", background: "#fff", color: "#111" }} dangerouslySetInnerHTML={{ __html: ed.conteudo ?? "" }} />
          <label style={{ fontSize: 13, display: "block", marginBottom: 10 }}><input type="checkbox" checked={ed.ativo !== false} onChange={(e) => setEd({ ...ed, ativo: e.target.checked })} /> Ativo</label>
          <button style={st.btnP} onClick={salvar}>Salvar</button>
          <Mensagem msg={msg} />
        </Modal>
      )}
      {ajuda && <Modal titulo="Variáveis disponíveis" fechar={() => setAjuda(false)}><p style={st.mut}>Substituídas pelos dados do Questor (empresa, filial e sócio) e pelos valores informados ao gerar:</p><p style={{ fontFamily: "monospace", fontSize: 13 }}>{VARIAVEIS.join("  ")}</p></Modal>}
    </div>
  );
}
