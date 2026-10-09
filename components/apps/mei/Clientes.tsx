"use client";

// Clientes mensais (MEI) + Ficha MEI (ficha_mei, Encerramento, ativar empresa, observação,
// tarefas pendentes e senhas).
import { useEffect, useState } from "react";
import {
  api, ler, st, Tabela, Campo, Mensagem, Modal, SelectSalao, brl, dt, hojeISO, situacao, semHtml, resumoGravacao, mensagemErro, type Mei,
} from "./ui";
import { SenhasEmpresa } from "./Senhas";

export function Clientes({ mei, abrir }: { mei: Mei[]; abrir: (m: Mei) => void }) {
  const [q, setQ] = useState("");
  const [sit, setSit] = useState("Ativos");
  const [sal, setSal] = useState("");
  const L = mei.filter((m) => (m.razao + " " + m.cnpj + " " + m.cod).toLowerCase().includes(q.toLowerCase())
    && (sit === "Todos" || (sit === "Ativos") === m.ativo) && (!sal || String(m.salaoCod) === sal))
    .sort((a, b) => a.razao.localeCompare(b.razao));
  return (
    <div style={st.card}>
      <div style={st.bar}>
        <Campo label="Pesquisar"><input style={{ ...st.input, minWidth: 280 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código, razão social ou CNPJ…" /></Campo>
        <Campo label="Situação"><select style={st.input} value={sit} onChange={(e) => setSit(e.target.value)}>{["Todos", "Ativos", "Inativos"].map((x) => <option key={x}>{x}</option>)}</select></Campo>
        <SelectSalao mei={mei} valor={sal} onChange={setSal} />
        <span style={st.mut}>{L.length} empresa(s)</span>
      </div>
      <Tabela total={L.length} onLinha={(i) => abrir(L[i])}
        cab={["Cód.", "Razão social", "CNPJ", "Salão", "Cidade", "Início ativ.", "Mensalidade", "Situação", "Bloqueio", ""]}
        linhas={L.slice(0, 300).map((m) => [m.cod, m.razao, m.cnpj, m.salao || "—", m.cidade, dt(m.inicio), m.mensal ? brl(m.mensal) + (m.mensalNF ? " NF" : "") : "—",
          m.ativo ? "Ativo" : `Inativo (${dt(m.fim)})`, m.bloqueado ? "BLOQUEADO" : "",
          <button key="a" style={st.btn} onClick={() => abrir(m)}>Abrir ficha</button>])} />
    </div>
  );
}

interface Tarefa { id: number; servico_descricao: string; competencia: string | null; data_servico: string | null; responsavel_nome: string }

export function Ficha({ m, voltar, mudou }: { m: Mei; voltar: () => void; mudou: () => void }) {
  const [aba, setAba] = useState<"Dados" | "Senhas" | "Outros">("Dados");
  const [pend, setPend] = useState<Tarefa[] | null>(null);
  const [obs, setObs] = useState<string | null>(null);
  const [obsEd, setObsEd] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [encerrar, setEncerrar] = useState(false);
  const [editar, setEditar] = useState(false);

  useEffect(() => {
    ler<{ dados: Tarefa[] }>("/mei/tarefas", { codigoempresa: m.cod, status: "Em Aberto", limit: 500 }).then((j) => setPend(j.dados ?? [])).catch(() => setPend([]));
    api<{ obs?: string }>("GET", `/mei/observacoes/${m.cod}`).then((r) => setObs(r.status === 200 ? (r.dados?.obs ?? "") : "")).catch(() => setObs(""));
  }, [m.cod]);

  async function salvarObs() {
    const r = await api("PUT", `/mei/observacoes/${m.cod}`, { corpo: { obs: obsEd ?? "" } });
    setMsg(resumoGravacao(r));
    if (r.status < 300 && !r.dryRunForcado) { setObs(obsEd); setObsEd(null); }
  }
  async function reativar() {
    if (!confirm(`Reativar ${m.cod} - ${m.razao}? (encerramento volta para 31/12/2100)`)) return;
    const r = await api("POST", `/empresas/${m.cod}/reativar`, { idempotencia: `mei-reativar-${m.cod}-${hojeISO()}` });
    setMsg(resumoGravacao(r));
    if (r.status < 300 && !r.dryRunForcado) mudou();
  }

  const salaoTxt = !m.salaoCod || m.salaoCod === 53278 ? "CLIENTE AVULSO" : `PROFISSIONAL DA EMPRESA ${m.salao}`;
  const grupos: [string, [string, React.ReactNode][]][] = [
    ["Empresa", [["Código", m.cod], ["Cód. financeiro", m.codigocliente ?? "—"], ["Razão social", m.razao], ["CNPJ", m.cnpj], ["Início atividade", dt(m.inicio)],
      ["Situação", m.ativo ? "Ativo" : "Inativo"], ["Data encerramento", m.ativo ? "" : dt(m.fim)], ["Bloqueio", m.bloqueado ? "BLOQUEADO" : ""],
      ["I.E.", m.ie], ["I.M.", m.im], ["Ativ. federal", m.cnae], ["Serviço municipal", m.ativMunic]]],
    ["Endereço", [["Logradouro", m.endereco], ["Complemento", m.compl], ["Bairro", m.bairro], ["Cidade / UF", `${m.cidade}${m.uf ? " / " + m.uf : ""}`], ["CEP", m.cep], ["Telefone", m.cel], ["E-mail", m.email]]],
    ["Titular (sócio 1)", [["Nome", m.socio], ["CPF", m.cpf], ["Nascimento", dt(m.nasc)], ["Título de eleitor", m.titulo], ["Nome da mãe", m.mae], ["RG", m.rg], ["Celular/WhatsApp", m.whats]]],
    ["Salão e cobrança", [["Salão", salaoTxt], ["Cód. salão", m.salaoCod ?? ""], ["Mensalidade", m.mensal ? brl(m.mensal) + (m.mensalNF ? " (NF)" : "") : "—"], ["Cliente desde", dt(m.clienteDesde)]]],
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <button style={st.btn} onClick={voltar}>← Voltar</button>
        <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>Ficha MEI — {m.cod} - {m.razao}</h2>
        {m.ativo ? <button style={st.btnD} onClick={() => setEncerrar(true)}>Baixar (encerrar)</button> : <button style={st.btn} onClick={reativar}>Ativar empresa</button>}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["Dados", "Senhas", "Outros"] as const).map((a) => <button key={a} style={a === aba ? st.btnP : st.btn} onClick={() => setAba(a)}>{a}</button>)}
      </div>
      <Mensagem msg={msg} />

      {aba === "Dados" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
            {grupos.map(([titulo, campos]) => (
              <div key={titulo} style={st.card}>
                <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>{titulo}</h3>
                {campos.map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 10, fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ color: "var(--muted)", minWidth: 140 }}>{k}</span><span>{v || "—"}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={st.bar}><button style={st.btnP} onClick={() => setEditar(true)}>Editar dados (salão, I.E., I.M., sócio)</button></div>
          <div style={st.card}>
            <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Tarefas pendentes</h3>
            {pend === null ? <p style={st.mut}>Carregando…</p> : (
              <Tabela cab={["Nº", "Serviço", "Competência", "Data", "Responsável"]}
                linhas={pend.map((t) => [t.id, t.servico_descricao, t.competencia ? `${t.competencia.slice(5, 7)}/${t.competencia.slice(0, 4)}` : "", dt(t.data_servico), t.responsavel_nome])} />
            )}
          </div>
        </>
      )}

      {aba === "Senhas" && <SenhasEmpresa m={m} />}

      {aba === "Outros" && (
        <div style={st.card}>
          <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Observação</h3>
          {obsEd === null ? (
            <>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 13, minHeight: 60 }}>{obs === null ? "Carregando…" : semHtml(obs) || "—"}</div>
              <button style={{ ...st.btn, marginTop: 10 }} onClick={() => setObsEd(semHtml(obs))}>Editar</button>
            </>
          ) : (
            <>
              <textarea style={{ ...st.input, width: "100%", minHeight: 140 }} value={obsEd} onChange={(e) => setObsEd(e.target.value)} />
              <div style={{ ...st.bar, marginTop: 10 }}><button style={st.btnP} onClick={salvarObs}>Salvar</button><button style={st.btn} onClick={() => setObsEd(null)}>Cancelar</button></div>
            </>
          )}
        </div>
      )}

      {encerrar && <Encerramento m={m} fechar={() => setEncerrar(false)} mudou={mudou} />}
      {editar && <EditarDados m={m} fechar={() => setEditar(false)} mudou={mudou} />}
    </div>
  );
}

/** Form "Encerramento": baixa no Questor (estab + financeiro + mensalidade) e comunicado de saída. */
function Encerramento({ m, fechar, mudou }: { m: Mei; fechar: () => void; mudou: () => void }) {
  const [data, setData] = useState(hojeISO());
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [feito, setFeito] = useState(false);

  async function salvar() {
    if (!data) return;
    if (!confirm(`Encerrar ${m.cod} - ${m.razao} em ${dt(data)}?`)) return;
    const r = await api("POST", `/empresas/${m.cod}/encerrar`, { corpo: { data_encerramento: data }, idempotencia: `mei-encerrar-${m.cod}-${data}` });
    const res = resumoGravacao(r);
    setMsg(r.status < 300 ? { ok: true, texto: `${res.texto} Resultado: ${JSON.stringify(r.dados).slice(0, 400)}` } : { ok: false, texto: mensagemErro(r) });
    if (r.status < 300) { setFeito(true); if (!r.dryRunForcado) mudou(); }
  }

  function comunicado() {
    const salao = !m.salaoCod || m.salaoCod === 53278 ? "CLIENTE AVULSO" : m.salao;
    const corpo = `<p>Prezados(as),</p><p>Venho comunicar a todos o desligamento da profissional:</p><p><b>${salao}<br>${m.cod} - ${m.razao}</b><br>CNPJ: ${m.cnpj}</p><p>Questor: Baixada<br>Data de Saída: <span style="color:red">${dt(data)}</span></p>`;
    const eml = [`To: anna.caroline@phdcontabil.com.br, debora@phdcontabil.com.br`, `Subject: Comunicado de Saída - ${m.razao}`, "MIME-Version: 1.0",
      "X-Unsent: 1", "Content-Type: text/html; charset=UTF-8", "", corpo].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([eml], { type: "message/rfc822" }));
    a.download = `Comunicado de Saida - ${m.cod}.eml`;
    a.click();
  }

  return (
    <Modal titulo="Encerramento" fechar={fechar}>
      <p style={st.mut}><b>{m.cod} - {m.razao}</b> · CNPJ {m.cnpj}</p>
      <Campo label="Data de encerramento"><input type="date" style={st.input} value={data} onChange={(e) => setData(e.target.value)} /></Campo>
      <div style={{ ...st.bar, marginTop: 10 }}>
        <button style={st.btnD} onClick={salvar}>Salvar encerramento</button>
        <button style={st.btn} onClick={comunicado} disabled={!feito}>Gerar comunicado (.eml)</button>
      </div>
      <Mensagem msg={msg} />
    </Modal>
  );
}

/** "Salvar" da aba Dados do Access: ESTAB (salão, I.E., I.M.) e SOCIO 1 no Questor. Só envia o que mudou. */
function EditarDados({ m, fechar, mudou }: { m: Mei; fechar: () => void; mudou: () => void }) {
  const dig = (s: string) => s.replace(/\D/g, "");
  const tel = (s: string) => { const d = dig(s); return { ddd: d.slice(0, 2), num: d.slice(2) }; };
  const ini = {
    apelidoestab: m.apelido, inscrestad: m.ie, inscrmunic: m.im,
    inscrfederal: m.cpf, datanasc: (m.nasc ?? "").slice(0, 10), tituloeleitornumero: m.titulo, email: m.email,
    fone: m.cel, celular: m.whats, nomemae: m.mae, numerorg: m.rg,
  };
  const [d, setD] = useState({ ...ini });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const campo = (k: keyof typeof ini, label: string, tipo = "text") => (
    <Campo label={label}><input type={tipo} style={st.input} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} /></Campo>
  );
  async function salvar() {
    if (!d.datanasc) { setMsg({ ok: false, texto: "Data de nascimento do sócio é obrigatória (regra do Access)." }); return; }
    const estab: Record<string, unknown> = {};
    for (const k of ["apelidoestab", "inscrestad", "inscrmunic"] as const) if (d[k] !== ini[k]) estab[k] = d[k];
    const socio: Record<string, unknown> = {};
    for (const k of ["inscrfederal", "datanasc", "tituloeleitornumero", "email", "nomemae", "numerorg"] as const) if (d[k] !== ini[k]) socio[k] = d[k];
    if (d.fone !== ini.fone) { const t = tel(d.fone); socio.dddfone = t.ddd; socio.numerofone = t.num; }
    if (d.celular !== ini.celular) { const t = tel(d.celular); socio.dddcelular = t.ddd; socio.numerocelular = t.num; }
    if (!Object.keys(estab).length && !Object.keys(socio).length) { setMsg({ ok: false, texto: "Nada foi alterado." }); return; }
    if (!confirm("Gravar as alterações no Questor?")) return;
    const linhas: string[] = [];
    let ok = true;
    if (Object.keys(estab).length) {
      const r = await api("PATCH", `/cadastro/estabelecimento/${m.cod}/1`, { corpo: estab, idempotencia: `mei-estab-${m.cod}-${Date.now()}` });
      const x = resumoGravacao(r); ok = ok && x.ok; linhas.push(`Estabelecimento: ${x.texto}`);
    }
    if (Object.keys(socio).length) {
      const r = await api("PATCH", `/cadastro/socio/${m.cod}/1`, { corpo: socio, idempotencia: `mei-socio-${m.cod}-${Date.now()}` });
      const x = resumoGravacao(r); ok = ok && x.ok; linhas.push(`Sócio: ${x.texto}`);
    }
    setMsg({ ok, texto: linhas.join(" | ") });
    if (ok) mudou();
  }
  return (
    <Modal titulo={`Editar dados — ${m.cod} - ${m.razao}`} fechar={fechar} largura={760}>
      <h4 style={{ margin: "0 0 8px" }}>Estabelecimento</h4>
      <div style={st.grid}>{campo("apelidoestab", "Salão (cód. financeiro; 53278 = avulso)")}{campo("inscrestad", "I.E.")}{campo("inscrmunic", "I.M.")}</div>
      <h4 style={{ margin: "0 0 8px" }}>Sócio (titular)</h4>
      <div style={st.grid}>
        {campo("inscrfederal", "CPF")}{campo("datanasc", "Nascimento *", "date")}{campo("tituloeleitornumero", "Título de eleitor")}
        {campo("nomemae", "Nome da mãe")}{campo("numerorg", "RG")}{campo("email", "E-mail")}
        {campo("fone", "Telefone (DDD + número)")}{campo("celular", "Celular/WhatsApp (DDD + número)")}
      </div>
      <button style={st.btnP} onClick={salvar}>Salvar</button>
      <Mensagem msg={msg} />
    </Modal>
  );
}

export { situacao };
