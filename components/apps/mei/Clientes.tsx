"use client";

// Clientes mensais (MEI) + Ficha MEI (ficha_mei, Encerramento, ativar empresa, observação,
// tarefas pendentes e senhas).
import { useEffect, useState } from "react";
import {
  api, ler, st, Tabela, Campo, Mensagem, Modal, SelectSalao, brl, dt, hojeISO, situacao, semHtml, resumoGravacao, mensagemErro, type Mei,
Doc, } from "./ui";
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

interface Tarefa { id: number; servico_id: number; servico_descricao: string; competencia: string | null; data_servico: string | null; data_entrega: string | null; status: string; responsavel_nome: string }
interface OSResumo { nos?: number; data: string | null; tipo: string | null; valortt: number | null; servico1: string | null }
interface NotaResumo { codigoempresa: number; numeronf: number; serienf: string | null; datalctofis: string; valorcontabil: number }

const compTxt = (c: string | null) => (c ? `${c.slice(5, 7)}/${c.slice(0, 4)}` : "");
const diasAtras = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

function Selo({ cor, children }: { cor: "ok" | "div" | "neutro" | "aviso"; children: React.ReactNode }) {
  const c = { ok: ["rgba(22,163,74,.12)", "#15803d"], div: ["rgba(220,38,38,.12)", "#b91c1c"], neutro: ["var(--accent-soft)", "var(--accent)"], aviso: ["rgba(234,179,8,.15)", "#a16207"] }[cor];
  return <span style={{ background: c[0], color: c[1], borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{children}</span>;
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, fontSize: 13, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--muted)", minWidth: 130 }}>{k}</span><span style={{ wordBreak: "break-word" }}>{v || "—"}</span>
    </div>
  );
}

const ABAS = ["Resumo", "Tarefas", "O.S.", "Notas", "Senhas", "Observação"] as const;
type Aba = (typeof ABAS)[number];

/** Ficha do MEI como central: dados, tarefas, O.S., notas, senhas e observação da empresa numa tela só. */
export function Ficha({ m, voltar, mudou, emitirNota }: { m: Mei; voltar: () => void; mudou: () => void; emitirNota?: (m: Mei) => void }) {
  const [aba, setAba] = useState<Aba>("Resumo");
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null);
  const [oss, setOss] = useState<OSResumo[] | null>(null);
  const [notas, setNotas] = useState<NotaResumo[] | null>(null);
  const [obs, setObs] = useState<string | null>(null);
  const [obsEd, setObsEd] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [encerrar, setEncerrar] = useState(false);
  const [editar, setEditar] = useState(false);

  useEffect(() => {
    setTarefas(null); setOss(null); setNotas(null); setObs(null);
    ler<{ dados: Tarefa[] }>("/mei/tarefas", { codigoempresa: m.cod, de: "2000-01-01", ate: "2100-12-31", limit: 300 }).then((j) => setTarefas(j.dados ?? [])).catch(() => setTarefas([]));
    api<{ obs?: string }>("GET", `/mei/observacoes/${m.cod}`).then((r) => setObs(r.status === 200 ? (r.dados?.obs ?? "") : "")).catch(() => setObs(""));
    ler<{ dados: OSResumo[] }>("/mei/os", { q: m.cnpj || m.razao, limit: 50 }).then((j) => setOss(j.dados ?? [])).catch(() => setOss([]));
    if (m.salaoCod) {
      ler<{ dados: NotaResumo[] }>("/fiscal/lancamentos", { tipo: "saida", salao: m.salaoCod, data_inicio: diasAtras(91), data_fim: hojeISO() })
        .then((j) => setNotas((j.dados ?? []).filter((n) => n.codigoempresa === m.cod).sort((a, b) => b.datalctofis.localeCompare(a.datalctofis))))
        .catch(() => setNotas([]));
    } else setNotas([]);
  }, [m.cod, m.cnpj, m.razao, m.salaoCod]);

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

  const abertas = (tarefas ?? []).filter((t) => t.status !== "Encerrado");
  const vencidas = abertas.filter((t) => (t.data_servico ?? "9999") < hojeISO());
  const salaoTxt = !m.salaoCod || m.salaoCod === 53278 ? "Cliente avulso" : m.salao;
  const totalNotas = (notas ?? []).reduce((a, n) => a + (n.valorcontabil || 0), 0);
  const contagem: Record<Aba, number | null> = { Resumo: null, Tarefas: tarefas ? abertas.length : null, "O.S.": oss?.length ?? null, Notas: notas?.length ?? null, Senhas: null, "Observação": null };

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ ...st.card, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button style={st.btn} onClick={voltar}>← Voltar</button>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Ficha MEI · cód. {m.cod}{m.codigocliente ? ` · financeiro ${m.codigocliente}` : ""}</div>
            <h2 style={{ margin: "2px 0 0", fontSize: 20 }}>{m.razao}</h2>
          </div>
          {emitirNota && m.ativo && !m.bloqueado && <button style={st.btnP} onClick={() => emitirNota(m)}>Emitir nota</button>}
          <button style={st.btn} onClick={() => setEditar(true)}>Editar dados</button>
          {m.ativo ? <button style={st.btnD} onClick={() => setEncerrar(true)}>Encerrar</button> : <button style={st.btn} onClick={reativar}>Reativar</button>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {m.ativo ? <Selo cor="ok">Ativo</Selo> : <Selo cor="div">Inativo desde {dt(m.fim)}</Selo>}
          {m.bloqueado && <Selo cor="div">Bloqueado</Selo>}
          {vencidas.length > 0 && <Selo cor="aviso">{vencidas.length} tarefa(s) vencida(s)</Selo>}
          <Selo cor="neutro">CNPJ <Doc valor={m.cnpj} /></Selo>
          <Selo cor="neutro">{salaoTxt}</Selo>
          <Selo cor="neutro">{m.mensal ? `Mensalidade ${brl(m.mensal)}${m.mensalNF ? " (NF)" : ""}` : "Sem mensalidade"}</Selo>
          {m.cidade && <Selo cor="neutro">{m.cidade}{m.uf ? `/${m.uf}` : ""}</Selo>}
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: 4, margin: "12px 0", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        {ABAS.map((a) => (
          <button key={a} onClick={() => setAba(a)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "8px 14px", fontSize: 14, fontWeight: a === aba ? 700 : 500,
              color: a === aba ? "var(--accent)" : "var(--muted)", borderBottom: a === aba ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1 }}>
            {a}{contagem[a] !== null ? <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.8 }}>({contagem[a]})</span> : null}
          </button>
        ))}
      </div>
      <Mensagem msg={msg} />

      {aba === "Resumo" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
          <div style={st.card}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Empresa</h3>
            <Info k="Início atividade" v={dt(m.inicio)} /><Info k="Cliente desde" v={dt(m.clienteDesde)} /><Info k="I.E." v={m.ie} /><Info k="I.M." v={m.im} />
            <Info k="Ativ. federal" v={m.cnae} /><Info k="Serviço municipal" v={m.ativMunic} />
          </div>
          <div style={st.card}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Titular</h3>
            <Info k="Nome" v={m.socio} /><Info k="CPF" v={m.cpf ? <Doc valor={m.cpf} /> : ""} /><Info k="Nascimento" v={dt(m.nasc)} /><Info k="RG" v={m.rg} />
            <Info k="Título de eleitor" v={m.titulo} /><Info k="Nome da mãe" v={m.mae} />
          </div>
          <div style={st.card}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Contato e endereço</h3>
            <Info k="Celular/WhatsApp" v={m.whats || m.cel} /><Info k="E-mail" v={m.email} />
            <Info k="Endereço" v={[m.endereco, m.compl].filter(Boolean).join(", ")} /><Info k="Bairro" v={m.bairro} /><Info k="CEP" v={m.cep} />
          </div>
          <div style={st.card}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Últimos movimentos</h3>
            <Info k="Tarefas em aberto" v={tarefas === null ? "…" : `${abertas.length}${vencidas.length ? ` (${vencidas.length} vencida(s))` : ""}`} />
            <Info k="Última O.S." v={oss === null ? "…" : oss[0] ? `nº ${oss[0].nos} · ${dt(oss[0].data)} · ${brl(oss[0].valortt ?? 0)}` : "nenhuma"} />
            <Info k="Notas (90 dias)" v={notas === null ? "…" : `${notas.length} · ${brl(totalNotas)}`} />
            <Info k="Observação" v={obs === null ? "…" : semHtml(obs).slice(0, 120) || "—"} />
          </div>
        </div>
      )}

      {aba === "Tarefas" && (
        <div style={st.card}>
          {tarefas === null ? <p style={st.mut}>Carregando…</p> : (
            <Tabela cab={["Nº", "Serviço", "Competência", "Data", "Entrega", "Responsável", "Status"]}
              linhas={[...tarefas].sort((a, b) => Number(a.status === "Encerrado") - Number(b.status === "Encerrado") || String(b.data_servico).localeCompare(String(a.data_servico)))
                .map((t) => [t.id, t.servico_descricao, compTxt(t.competencia), dt(t.data_servico), dt(t.data_entrega), t.responsavel_nome,
                  t.status === "Encerrado" ? <Selo key="s" cor="ok">Encerrada</Selo> : (t.data_servico ?? "9999") < hojeISO() ? <Selo key="s" cor="div">Vencida</Selo> : <Selo key="s" cor="aviso">Em aberto</Selo>])} />
          )}
        </div>
      )}

      {aba === "O.S." && (
        <div style={st.card}>
          {oss === null ? <p style={st.mut}>Carregando…</p> : oss.length === 0 ? <p style={st.mut}>Nenhuma O.S. encontrada para este CNPJ.</p> : (
            <Tabela cab={["Nº O.S.", "Data", "Tipo", "Serviço 1", "Total"]} linhas={oss.map((o) => [o.nos ?? "", dt(o.data), o.tipo ?? "", o.servico1 ?? "", brl(o.valortt ?? 0)])} />
          )}
          <p style={st.mut}>Para editar, imprimir ou mandar por e-mail, use Gestão de serviços → Gerar O.S.</p>
        </div>
      )}

      {aba === "Notas" && (
        <div style={st.card}>
          {notas === null ? <p style={st.mut}>Carregando…</p> : notas.length === 0 ? <p style={st.mut}>Nenhuma nota lançada nos últimos 90 dias.</p> : (
            <Tabela cab={["Nº", "Série", "Data", "Valor"]} linhas={notas.map((n) => [n.numeronf, n.serienf ?? "", dt(n.datalctofis), brl(n.valorcontabil)])} />
          )}
          {notas && notas.length > 0 && <p style={{ ...st.mut, textAlign: "right" }}>Total: <b>{brl(totalNotas)}</b></p>}
        </div>
      )}

      {aba === "Senhas" && <SenhasEmpresa m={m} />}

      {aba === "Observação" && (
        <div style={st.card}>
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

  async function comunicado() {
    const salao = !m.salaoCod || m.salaoCod === 53278 ? "CLIENTE AVULSO" : m.salao;
    const r = await fetch("/api/mei/comunicado", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cod: m.cod, razao: m.razao, cnpj: m.cnpj, salao, data }) });
    if ((r.headers.get("content-type") ?? "").includes("message/rfc822")) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await r.blob());
      a.download = `Comunicado de Saida - ${m.cod}.eml`;
      a.click();
      setMsg({ ok: true, texto: `${decodeURIComponent(r.headers.get("x-motivo") ?? "")} Abra o arquivo baixado no Outlook e envie.` });
      return;
    }
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? { ok: true, texto: `Comunicado enviado para ${(j.para ?? []).join(", ")}.` } : { ok: false, texto: j.error ?? "Falha ao enviar o comunicado." });
  }

  return (
    <Modal titulo="Encerramento" fechar={fechar}>
      <p style={st.mut}><b>{m.cod} - {m.razao}</b> · CNPJ {m.cnpj}</p>
      <Campo label="Data de encerramento"><input type="date" style={st.input} value={data} onChange={(e) => setData(e.target.value)} /></Campo>
      <div style={{ ...st.bar, marginTop: 10 }}>
        <button style={st.btnD} onClick={salvar}>Salvar encerramento</button>
        <button style={st.btn} onClick={comunicado} disabled={!feito}>Enviar comunicado de saída</button>
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
