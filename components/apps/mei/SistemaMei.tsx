"use client";

// Sistema MEI (migrado do MEI System). Somente leitura no Questor nesta fase:
// clientes, ficha, dados cadastrais, avulsos, notas, valores mensais e
// relatório Salão x MEI. O.S. usa a tela do Paralegal; a emissão de NFS-e
// continua no robô local (Playwright não roda no Vercel).

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

interface Servico { descricao?: string; valor?: number; competfinalvalid?: string | null }
interface Mei {
  cod: number; codigocliente: number | null; razao: string; cnpj: string; salao: string; salaoCnpj: string;
  inicio: string | null; fim: string | null; ativo: boolean; bloqueado: boolean; mensal: number;
  cidade: string; uf: string; email: string; cel: string; cpf: string; ie: string; im: string; cnae: string;
  endereco: string; compl: string; bairro: string; cep: string; mae: string; rg: string; nasc: string;
  titulo: string; whats: string; socio: string; servicos: Servico[]; ativMunic: string;
}
interface Nota { codigoempresa: number; nome?: string; especienf?: string; numeronf: string | number; serienf?: string; datalctofis: string; valorcontabil: number }
interface Avulso { codigocliente: number; nome: string; inscrfederal?: string; tipo: string; codigoempresa?: number | null; nomemunic?: string; baixado: boolean }

const ABAS = ["Clientes", "Dados MEI", "Avulsos", "Notas", "Valores mensais", "Salão x MEI", "O.S.", "Emissão NFS-e"] as const;
type Aba = (typeof ABAS)[number];
const LIMITE = 200;
const SEM_SALAO = "(sem salão)";

const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (s?: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "");
const situacao = (m: Mei) => (m.bloqueado ? "Bloqueado" : m.ativo ? "Ativo" : "Encerrado");

function baixarCsv(nome: string, cab: string[], linhas: (string | number)[][]) {
  const txt = [cab, ...linhas].map((l) => l.map((c) => String(c ?? "").replace(/;/g, ",")).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + txt], { type: "text/csv" }));
  a.download = nome;
  a.click();
}

const st = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 16 } as React.CSSProperties,
  bar: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 } as React.CSSProperties,
  input: { border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 13.5, background: "var(--surface)", color: "var(--text)" } as React.CSSProperties,
  btn: { border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "var(--surface)", color: "var(--text)", cursor: "pointer" } as React.CSSProperties,
  btnP: { border: "1px solid var(--accent)", borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "var(--accent)", color: "#fff", cursor: "pointer" } as React.CSSProperties,
  lbl: { display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--muted)" } as React.CSSProperties,
  mut: { color: "var(--muted)", fontSize: 13 } as React.CSSProperties,
  aviso: { background: "var(--accent-soft)", borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 12 } as React.CSSProperties,
};

function Tabela({ cab, linhas, total }: { cab: string[]; linhas: React.ReactNode[][]; total?: number }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>{cab.map((c) => <th key={c} style={{ textAlign: "left", padding: "8px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} style={{ background: i % 2 ? "var(--row-alt)" : undefined }}>
              {l.map((c, j) => <td key={j} style={{ padding: "7px 8px", borderBottom: "1px solid var(--border)" }}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!linhas.length && <p style={st.mut}>Nenhum registro.</p>}
      {total !== undefined && total > linhas.length && <p style={st.mut}>Mostrando {linhas.length} de {total}. Refine a pesquisa.</p>}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={st.lbl}><span>{label}</span>{children}</label>;
}

export default function SistemaMei() {
  const [aba, setAba] = useState<Aba>("Clientes");
  const [mei, setMei] = useState<Mei[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [ficha, setFicha] = useState<Mei | null>(null);

  const carregar = useCallback(async (forcar = false) => {
    setCarregando(true);
    setErro("");
    try {
      const r = await fetch(`/api/mei/empresas${forcar ? "?atualizar=1" : ""}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
      setMei(j.dados ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const saloes = useMemo(() => [...new Set(mei.map((m) => m.salao || SEM_SALAO))].sort(), [mei]);
  const ativos = mei.filter((m) => m.ativo).length;

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        {ABAS.map((a) => (
          <button key={a} onClick={() => { setAba(a); setFicha(null); }} style={a === aba ? st.btnP : st.btn}>{a}</button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={st.mut}>{carregando ? "Carregando carteira…" : `${mei.length} MEI · ${ativos} ativos`}</span>
        <button style={st.btn} onClick={() => carregar(true)} disabled={carregando}>Atualizar</button>
      </div>
      {erro && <div style={{ ...st.aviso, color: "var(--div)" }}>{erro}</div>}

      {ficha ? (
        <Ficha m={ficha} voltar={() => setFicha(null)} />
      ) : (
        <>
          {aba === "Clientes" && <Clientes mei={mei} saloes={saloes} abrir={setFicha} />}
          {aba === "Dados MEI" && <DadosMei mei={mei} />}
          {aba === "Avulsos" && <Avulsos />}
          {aba === "Notas" && <Notas mei={mei} saloes={saloes} />}
          {aba === "Valores mensais" && <Valores mei={mei} />}
          {aba === "Salão x MEI" && <RelSalao mei={mei} saloes={saloes} />}
          {aba === "O.S." && (
            <div style={st.card}>
              <p>As ordens de serviço do MEI usam a mesma lista do Paralegal (SharePoint <code>osfinanceiro</code>), com PDF e envio de e-mail pelo Graph.</p>
              <p style={st.mut}>Pendente para a migração completa: colunas novas na lista (serviços, salão, código do cliente, status) e importação do <code>data/os.json</code> antigo.</p>
              <Link href="/m/paralegal/controle" style={st.btnP}>Abrir Ordens de Serviço</Link>
            </div>
          )}
          {aba === "Emissão NFS-e" && (
            <div style={st.card}>
              <p>O robô de emissão (Playwright) abre o Chrome na máquina de quem usa, então não roda no Vercel.</p>
              <p style={st.mut}>Próximo passo: rodar o robô como serviço local num PC da PHD (ex.: phddc01) e o Núcleo chamar esse serviço com token próprio. Até lá, continue emitindo pelo MEI System local. O lançamento da nota no Questor depende de <code>POST /fiscal/nota-servico</code> na API.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function filtroSituacao(m: Mei, s: string) {
  return s === "Todos" || (s === "Ativos") === m.ativo;
}

function Clientes({ mei, saloes, abrir }: { mei: Mei[]; saloes: string[]; abrir: (m: Mei) => void }) {
  const [q, setQ] = useState("");
  const [sit, setSit] = useState("Ativos");
  const [sal, setSal] = useState("Todos");
  const L = mei.filter((m) => (m.razao + " " + m.cnpj + " " + m.cod).toLowerCase().includes(q.toLowerCase())
    && filtroSituacao(m, sit) && (sal === "Todos" || (m.salao || SEM_SALAO) === sal));
  return (
    <div style={st.card}>
      <div style={st.bar}>
        <Campo label="Pesquisar"><input style={{ ...st.input, minWidth: 280 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código, razão social ou CNPJ…" /></Campo>
        <Campo label="Situação"><select style={st.input} value={sit} onChange={(e) => setSit(e.target.value)}>{["Todos", "Ativos", "Inativos"].map((x) => <option key={x}>{x}</option>)}</select></Campo>
        <Campo label="Salão"><select style={st.input} value={sal} onChange={(e) => setSal(e.target.value)}><option>Todos</option>{saloes.map((x) => <option key={x}>{x}</option>)}</select></Campo>
      </div>
      <Tabela total={L.length} cab={["Cód.", "Razão social", "CNPJ", "Salão", "Cidade", "Início ativ.", "Mensalidade", "Situação", ""]}
        linhas={L.slice(0, LIMITE).map((m) => [m.cod, m.razao, m.cnpj, m.salao || "—", m.cidade, dt(m.inicio), m.mensal ? brl(m.mensal) : "—", situacao(m),
          <button key="a" style={st.btn} onClick={() => abrir(m)}>Abrir ficha</button>])} />
    </div>
  );
}

function DadosMei({ mei }: { mei: Mei[] }) {
  const [q, setQ] = useState("");
  const [sit, setSit] = useState("Ativos");
  const L = mei.filter((m) => (m.razao + " " + m.cnpj + " " + m.cod).toLowerCase().includes(q.toLowerCase()) && filtroSituacao(m, sit));
  const cab = ["Cód.", "Razão", "CNPJ", "IE", "IM", "CNAE", "Cidade", "Telefone", "E-mail", "Sócio"];
  const linha = (m: Mei) => [m.cod, m.razao, m.cnpj, m.ie, m.im, m.cnae, m.cidade, m.cel, m.email, m.socio];
  return (
    <div style={st.card}>
      <div style={st.bar}>
        <Campo label="Pesquisar"><input style={{ ...st.input, minWidth: 280 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Razão social, CNPJ ou cód." /></Campo>
        <Campo label="Situação"><select style={st.input} value={sit} onChange={(e) => setSit(e.target.value)}>{["Todos", "Ativos", "Inativos"].map((x) => <option key={x}>{x}</option>)}</select></Campo>
        <button style={st.btn} onClick={() => baixarCsv("clientes_mei.csv", [...cab, "Salão", "Situação", "Mensalidade"], L.map((m) => [...linha(m), m.salao, situacao(m), String(m.mensal).replace(".", ",")]))}>Exportar CSV</button>
      </div>
      <Tabela total={L.length} cab={cab} linhas={L.slice(0, LIMITE).map(linha)} />
    </div>
  );
}

function Avulsos() {
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [dados, setDados] = useState<Avulso[]>([]);
  const [msg, setMsg] = useState("Digite ao menos 3 letras do nome, CPF/CNPJ ou código.");
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) { setDados([]); return; }
      setMsg("Pesquisando…");
      try {
        const r = await fetch(`/api/mei/avulsos?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setDados(j.dados ?? []);
        setMsg("");
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Falha na pesquisa.");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [q]);
  const L = dados.filter((x) => tipo === "todos" || x.tipo === tipo);
  return (
    <div style={st.card}>
      <div style={st.bar}>
        <Campo label="Pesquisar"><input style={{ ...st.input, minWidth: 320 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome (3+ letras), CPF/CNPJ ou código" /></Campo>
        <Campo label="Tipo"><select style={st.input} value={tipo} onChange={(e) => setTipo(e.target.value)}>{["todos", "avulso", "empresa"].map((x) => <option key={x}>{x}</option>)}</select></Campo>
        <Link href="/m/paralegal/controle" style={st.btn}>Novo avulso (Paralegal)</Link>
      </div>
      {msg ? <p style={st.mut}>{msg}</p> : (
        <Tabela total={L.length} cab={["Cód. fin.", "Nome", "CPF/CNPJ", "Tipo", "Cód. empresa", "Cidade", "Situação"]}
          linhas={L.slice(0, LIMITE).map((x) => [x.codigocliente, x.nome, x.inscrfederal ?? "", x.tipo, x.codigoempresa ?? "—", x.nomemunic ?? "", x.baixado ? "Baixado" : "Ativo"])} />
      )}
    </div>
  );
}

function competenciaAnterior() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Notas({ mei, saloes }: { mei: Mei[]; saloes: string[] }) {
  const [comp, setComp] = useState(competenciaAnterior());
  const [sal, setSal] = useState("Todos");
  const [cods, setCods] = useState("");
  const [notas, setNotas] = useState<Nota[] | null>(null);
  const [info, setInfo] = useState("");
  const nomes = useMemo(() => Object.fromEntries(mei.map((m) => [m.cod, m.razao])), [mei]);

  function escolherSalao(v: string) {
    setSal(v);
    setCods(v === "Todos" ? "" : mei.filter((m) => m.ativo && (m.salao || SEM_SALAO) === v).slice(0, 60).map((m) => m.cod).join(", "));
  }

  async function buscar() {
    let lista = cods.split(/[,\s;]+/).map(Number).filter(Boolean);
    if (!lista.length) lista = mei.filter((m) => m.ativo).slice(0, 40).map((m) => m.cod);
    setInfo(`Consultando ${lista.length} empresa(s)…`);
    setNotas(null);
    try {
      const r = await fetch(`/api/mei/notas?competencia=${comp}&cods=${lista.slice(0, 60).join(",")}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setNotas(j.dados ?? []);
      setInfo(`${j.total} nota(s)${j.truncado ? " · resultado truncado pela API" : ""}`);
    } catch (e) {
      setInfo(e instanceof Error ? e.message : "Falha ao buscar notas.");
    }
  }

  const total = (notas ?? []).reduce((a, n) => a + (n.valorcontabil || 0), 0);
  return (
    <div style={st.card}>
      <div style={st.aviso}>A API limita a consulta a 1 mês e 5000 linhas; as notas são buscadas por código de empresa (até 60 por vez). Sem códigos, usa os 40 primeiros ativos.</div>
      <div style={st.bar}>
        <Campo label="Competência"><input type="month" style={st.input} value={comp} onChange={(e) => setComp(e.target.value)} /></Campo>
        <Campo label="Salão"><select style={st.input} value={sal} onChange={(e) => escolherSalao(e.target.value)}><option>Todos</option>{saloes.map((x) => <option key={x}>{x}</option>)}</select></Campo>
        <Campo label="Códigos MEI (vírgula)"><input style={{ ...st.input, minWidth: 260 }} value={cods} onChange={(e) => setCods(e.target.value)} placeholder="ex.: 3975, 3960" /></Campo>
        <button style={st.btnP} onClick={buscar}>Buscar notas</button>
        <button style={st.btn} disabled={!notas?.length} onClick={() => baixarCsv("notas_mei.csv", ["Código", "Empresa", "Espécie", "Nº NF", "Série", "Data", "Valor"],
          (notas ?? []).map((n) => [n.codigoempresa, nomes[n.codigoempresa] ?? n.nome ?? "", n.especienf ?? "", n.numeronf, n.serienf ?? "", dt(n.datalctofis), String(n.valorcontabil).replace(".", ",")]))}>Exportar CSV</button>
      </div>
      {info && <p style={st.mut}>{info}</p>}
      {notas && (
        <>
          <Tabela cab={["Cód.", "Empresa", "Espécie", "Nº NF", "Série", "Data", "Valor contábil"]}
            linhas={notas.map((n) => [n.codigoempresa, nomes[n.codigoempresa] ?? n.nome ?? "", n.especienf ?? "", n.numeronf, n.serienf ?? "", dt(n.datalctofis), brl(n.valorcontabil)])} />
          <p style={{ textAlign: "right", fontWeight: 600 }}>Total: {brl(total)}</p>
        </>
      )}
    </div>
  );
}

function Valores({ mei }: { mei: Mei[] }) {
  const [q, setQ] = useState("");
  const L = mei.filter((m) => m.ativo && (m.cod + " " + m.razao).toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={st.card}>
      <div style={st.aviso}>Na regra atual (serviços 72/102) a cobrança fica no cliente do salão, com o código do MEI no complemento. Sem esse vínculo, aparecem os serviços fixos do próprio MEI.</div>
      <div style={st.bar}>
        <Campo label="Cliente"><input style={{ ...st.input, minWidth: 280 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código ou nome" /></Campo>
      </div>
      <Tabela total={L.length} cab={["Cód.", "Cliente", "Serviços fixos vigentes", "Total mensal"]}
        linhas={L.slice(0, LIMITE).map((m) => [m.cod, m.razao, m.servicos.filter((s) => !s.competfinalvalid).map((s) => s.descricao).filter(Boolean).join(", ") || "—", m.mensal ? brl(m.mensal) : "—"])} />
      <p style={{ textAlign: "right", fontWeight: 600 }}>Total ({L.length} clientes): {brl(L.reduce((a, m) => a + m.mensal, 0))}</p>
    </div>
  );
}

function RelSalao({ mei, saloes }: { mei: Mei[]; saloes: string[] }) {
  const [de, setDe] = useState("2018-01-01");
  const [ate, setAte] = useState(new Date().toISOString().slice(0, 10));
  const [sal, setSal] = useState("Todos");
  const [sit, setSit] = useState("Ativos");
  const L = mei.filter((m) => (m.inicio ?? "") >= de && (m.inicio ?? "") <= ate && (sal === "Todos" || (m.salao || SEM_SALAO) === sal) && filtroSituacao(m, sit))
    .sort((a, b) => (a.salao || "").localeCompare(b.salao || "") || a.cod - b.cod);
  const linha = (m: Mei) => [m.salao || SEM_SALAO, m.cod, m.razao, m.cnpj, dt(m.inicio), m.ativo ? "" : dt(m.fim), situacao(m)];
  const cab = ["Salão", "Cód.", "MEI", "CNPJ", "Início atividade", "Encerramento", "Situação"];
  return (
    <div style={st.card}>
      <div style={st.bar}>
        <Campo label="Início de"><input type="date" style={st.input} value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
        <Campo label="Até"><input type="date" style={st.input} value={ate} onChange={(e) => setAte(e.target.value)} /></Campo>
        <Campo label="Salão"><select style={st.input} value={sal} onChange={(e) => setSal(e.target.value)}><option>Todos</option>{saloes.map((x) => <option key={x}>{x}</option>)}</select></Campo>
        <Campo label="Situação"><select style={st.input} value={sit} onChange={(e) => setSit(e.target.value)}>{["Todos", "Ativos", "Inativos"].map((x) => <option key={x}>{x}</option>)}</select></Campo>
        <button style={st.btn} onClick={() => baixarCsv("salao_x_mei.csv", cab, L.map(linha))}>Exportar CSV</button>
        <button style={st.btn} onClick={() => window.print()}>Imprimir</button>
      </div>
      <Tabela total={L.length} cab={cab} linhas={L.slice(0, 500).map(linha)} />
      <p style={st.mut}>{L.length} MEI(s) no período.</p>
    </div>
  );
}

function Ficha({ m, voltar }: { m: Mei; voltar: () => void }) {
  const [det, setDet] = useState<{ cadastro: Record<string, unknown> | null } | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    fetch(`/api/mei/empresas/${m.cod}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setDet(j);
    }).catch((e) => setErro(e instanceof Error ? e.message : "Falha ao carregar ficha."));
  }, [m.cod]);

  const grupos: [string, [string, React.ReactNode][]][] = [
    ["Empresa", [["Código", m.cod], ["Cód. financeiro", m.codigocliente ?? "—"], ["Razão social", m.razao], ["CNPJ", m.cnpj], ["Situação", situacao(m)],
      ["Início atividade", dt(m.inicio)], ["Encerramento", m.ativo ? "" : dt(m.fim)], ["CNAE", m.cnae], ["I.E.", m.ie], ["I.M.", m.im], ["Ativ. municipal", m.ativMunic]]],
    ["Endereço e contato", [["Endereço", m.endereco], ["Complemento", m.compl], ["Bairro", m.bairro], ["Cidade/UF", `${m.cidade}/${m.uf}`], ["CEP", m.cep],
      ["Telefone", m.cel], ["WhatsApp", m.whats], ["E-mail", m.email]]],
    ["Titular", [["Nome", m.socio], ["CPF", m.cpf], ["RG", m.rg], ["Nascimento", dt(m.nasc)], ["Mãe", m.mae], ["Título de eleitor", m.titulo]]],
    ["Salão e cobrança", [["Salão", m.salao || "—"], ["CNPJ do salão", m.salaoCnpj], ["Mensalidade", m.mensal ? brl(m.mensal) : "—"],
      ["Serviços fixos", m.servicos.filter((s) => !s.competfinalvalid).map((s) => `${s.descricao ?? ""}${s.valor ? " (" + brl(s.valor) + ")" : ""}`).join(", ") || "—"]]],
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button style={st.btn} onClick={voltar}>← Voltar</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Ficha MEI — {m.razao}</h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        {grupos.map(([titulo, campos]) => (
          <div key={titulo} style={st.card}>
            <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>{titulo}</h3>
            {campos.map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 10, fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ color: "var(--muted)", minWidth: 130 }}>{k}</span><span>{v || "—"}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ ...st.card, marginTop: 12 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Cadastro completo (Questor)</h3>
        {erro ? <p style={{ color: "var(--div)" }}>{erro}</p> : !det ? <p style={st.mut}>Carregando…</p> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "2px 16px", fontSize: 12.5 }}>
            {Object.entries(det.cadastro ?? {}).filter(([, v]) => v !== null && v !== "" && typeof v !== "object").map(([k, v]) => (
              <div key={k}><span style={{ color: "var(--muted)" }}>{k}: </span>{String(v)}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
