"use client";

// O.S. do MEI = menuos (lista, editar, imprimir, e-mail) + geraros/ostroca (nova O.S. com cobrança)
// + ostrocamanutencao (editar). Grava em mei.osfinanceiro pela API (/mei/os), a mesma tabela do Access.
// Regras de cobrança do ostroca:
//  - cobrança no Salão (cliente = salão do MEI) ou no Profissional (cliente = cód. financeiro dele);
//    sem empresa ativa no Questor, só no Profissional;
//  - serviço 72/102 no Salão herda o último valor fixo que o salão já paga; os demais vêm da tabela de preço;
//  - 72/102 => SERVICOFIXO mensal; demais => SERVICOVARIAVEL (data = início dos trabalhos).
import { useCallback, useEffect, useState } from "react";
import { api, ler, st, Campo, Mensagem, Tabela, Modal, brl, dt, hojeISO, resumoGravacao, mensagemErro, AVULSO, type Mei } from "./ui";
import { gerarDocPdfOS, nomeArquivoPdfOS, pdfParaBase64 } from "@/components/apps/paralegal/os-pdf";

interface ClienteFin { codigocliente: number; nome: string; inscrfederal?: string; codigoempresa?: number | null; tipologradouro?: string | null; logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null; nomemunic?: string | null; siglaestado?: string | null; cep?: string | null; telefone?: string | null; email?: string | null }
interface ServEscrit { codigo: number; descricao: string; valor: number | null }
interface Fixo { codigoservicoescrit: number; valor: number; competinicialvalid: string | null }
export interface OS {
  nos?: number; data: string | null; codigo: number | null; tipo: string | null; questor: number | null; razao: string | null; cnpj: string | null;
  logradouro: string | null; numero: string | number | null; complemento: string | null; bairro: string | null; cidade: string | null; cep: string | null;
  contato: string | null; email: string | null; telefone: string | null; celular: string | null; indicacao: string | null; tratadocom: string | null;
  obs: string | null; obsgerais?: string | null; usuario: string | null; datainicio: string | null;
  servico1: string | null; servico2: string | null; servico3: string | null; servico4: string | null;
  valorserv1: number | null; valorserv2: number | null; valorserv3: number | null; valorserv4: number | null; valortt: number | null;
}

const TIPOS = ["MEI", "Avulso", "Cancelamento", "Desenquadramento"];
const FIXOS = [72, 102];
const PERIODO = "1;2;3;4;5;6;7;8;9;10;11;12";
const POR_PAGINA = 50;
const vazio = (): OS => ({ data: hojeISO(), codigo: null, tipo: "MEI", questor: null, razao: "", cnpj: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", cep: "",
  contato: "", email: "", telefone: "", celular: "", indicacao: "", tratadocom: "", obs: "", usuario: "", datainicio: hojeISO(),
  servico1: "", servico2: "", servico3: "", servico4: "", valorserv1: null, valorserv2: null, valorserv3: null, valorserv4: null, valortt: null });
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

function useServicos() {
  const [s, setS] = useState<ServEscrit[]>([]);
  useEffect(() => {
    ler<{ dados: ServEscrit[] }>("/lookups/servicos", { limit: 1000 }).then((j) => setS((j.dados ?? []).sort((a, b) => a.descricao.localeCompare(b.descricao)))).catch(() => null);
  }, []);
  return s;
}

/** PDF no layout das O.S. do Núcleo (Financeiro = OSFinanceiro, Geral = OSGeral). */
async function pdfDaOS(o: OS, publico: "financeiro" | "geral", servicos: ServEscrit[], m?: Mei) {
  const desc = (c: string | null) => { if (!c) return ""; const s = servicos.find((x) => String(x.codigo) === String(c)); return s ? `${s.codigo} - ${s.descricao}` : String(c); };
  const salaoTxt = m?.salaoCod && m.salaoCod !== AVULSO ? `Profissional da Empresa: ${m.salao}` : "AVULSO";
  const d = {
    id: String(o.nos ?? "(nova)"), codigo: String(o.codigo ?? ""), questor: String(o.questor ?? ""), tipo: o.tipo ?? "", data: o.data, dataInicio: o.datainicio,
    razao: o.razao ?? "", cnpj: o.cnpj ?? "", logradouro: o.logradouro ?? "", numero: String(o.numero ?? "").replace(/\.0$/, ""), complemento: o.complemento ?? "",
    bairro: o.bairro ?? "", cidade: o.cidade ?? "", cep: o.cep ?? "", contato: o.contato ?? "", telefone: o.telefone ?? "", celular: o.celular ?? "", email: o.email ?? "",
    servicos: [desc(o.servico1), desc(o.servico2), desc(o.servico3), desc(o.servico4)] as [string, string, string, string],
    valoresServ: [o.valorserv1, o.valorserv2, o.valorserv3, o.valorserv4].map((v, i) => ([o.servico1, o.servico2, o.servico3, o.servico4][i] ? Number(v ?? 0) : null)) as [number | null, number | null, number | null, number | null],
    valorTT: o.valortt, obs: `${salaoTxt}${o.obs ? "\n" + o.obs : ""}`, obsGerais: o.obsgerais ?? o.obs ?? "", tratadoCom: o.tratadocom ?? "", usuario: o.usuario ?? "",
    inscrEstadual: m?.ie, inscrMunicipal: m?.im, ativPrincipal: m?.cnae, regimeTributario: "MEI",
  };
  const doc = await gerarDocPdfOS(d, publico);
  return { doc, nome: nomeArquivoPdfOS(d, publico) };
}

export default function OSMei({ mei }: { mei: Mei[] }) {
  const servicos = useServicos();
  const [lista, setLista] = useState<OS[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [f, setF] = useState({ q: "", de: "", ate: "", tipo: "" });
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [editando, setEditando] = useState<OS | "nova" | null>(null);
  const porCod = new Map(mei.map((m) => [m.cod, m]));

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const j = await ler<{ dados: OS[]; total_geral?: number; total: number }>("/mei/os", { ...f, limit: POR_PAGINA, offset: pagina * POR_PAGINA });
      setLista(j.dados ?? []); setTotal(j.total_geral ?? j.total ?? 0);
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar as O.S."); }
  }, [f, pagina]);
  useEffect(() => { carregar(); }, [carregar]);

  async function baixarPdf(o: OS, publico: "financeiro" | "geral") {
    const { doc, nome } = await pdfDaOS(o, publico, servicos, porCod.get(Number(o.questor)));
    doc.save(nome);
  }
  async function email(o: OS, publico: "financeiro" | "geral") {
    setMsg({ ok: true, texto: "Gerando PDF e e-mail…" });
    const { doc, nome } = await pdfDaOS(o, publico, servicos, porCod.get(Number(o.questor)));
    const r = await fetch("/api/mei/os/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nos: o.nos, publico, pdfBase64: pdfParaBase64(doc), nomeArquivo: nome }) });
    if (r.headers.get("content-type")?.includes("message/rfc822")) {
      const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = `OS ${o.nos} - ${publico}.eml`; a.click();
      setMsg({ ok: true, texto: "Rascunho de e-mail baixado (abra no Outlook e clique em Enviar)." + (r.headers.get("x-motivo") ? ` ${decodeURIComponent(r.headers.get("x-motivo")!)}` : "") });
      return;
    }
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? { ok: true, texto: `E-mail enviado para ${(j.para ?? []).join(", ")}.` } : { ok: false, texto: j.error ?? "Falha ao enviar." });
  }

  if (editando) return <FormOS os={editando === "nova" ? null : editando} mei={mei} servicos={servicos} fechar={() => { setEditando(null); carregar(); }} />;

  return (
    <div style={st.card}>
      <div style={st.bar}>
        <Campo label="Pesquisar"><input style={{ ...st.input, minWidth: 240 }} value={f.q} onChange={(e) => { setPagina(0); setF({ ...f, q: e.target.value }); }} placeholder="Razão social, CNPJ…" /></Campo>
        <Campo label="Data de"><input type="date" style={st.input} value={f.de} onChange={(e) => { setPagina(0); setF({ ...f, de: e.target.value }); }} /></Campo>
        <Campo label="até"><input type="date" style={st.input} value={f.ate} onChange={(e) => { setPagina(0); setF({ ...f, ate: e.target.value }); }} /></Campo>
        <Campo label="Tipo"><select style={st.input} value={f.tipo} onChange={(e) => { setPagina(0); setF({ ...f, tipo: e.target.value }); }}><option value="">Todos</option>{TIPOS.map((t) => <option key={t}>{t}</option>)}</select></Campo>
        <button style={st.btnP} onClick={() => setEditando("nova")}>Gerar O.S.</button>
        <span style={st.mut}>{total} O.S.</span>
      </div>
      {erro && <div style={{ ...st.aviso, color: "var(--div)" }}>{erro}</div>}
      <Mensagem msg={msg} />
      <Tabela cab={["O.S.", "Data", "Empresa", "Tipo", "Cód. Questor", "Cód. fin.", "Total", ""]}
        linhas={lista.map((o) => [o.nos, dt(o.data), o.razao, o.tipo, o.questor ?? "", o.codigo ?? "", brl(Number(o.valortt ?? 0)),
          <span key="b" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button style={st.btn} onClick={() => setEditando(o)}>Editar</button>
            <button style={st.btn} onClick={() => baixarPdf(o, "financeiro")}>PDF Fin.</button>
            <button style={st.btn} onClick={() => baixarPdf(o, "geral")}>PDF Geral</button>
            <button style={st.btn} onClick={() => email(o, "financeiro")}>E-mail Fin.</button>
            <button style={st.btn} onClick={() => email(o, "geral")}>E-mail Geral</button>
          </span>])} />
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
        <button style={st.btn} disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>‹ Anterior</button>
        <span style={st.mut}>Página {pagina + 1} de {Math.max(1, Math.ceil(total / POR_PAGINA))}</span>
        <button style={st.btn} disabled={(pagina + 1) * POR_PAGINA >= total} onClick={() => setPagina((p) => p + 1)}>Próxima ›</button>
      </div>
      <p style={st.mut}>Excluir O.S. só com perfil de administrador da API (como combinado).</p>
    </div>
  );
}

function FormOS({ os, mei, servicos, fechar }: { os: OS | null; mei: Mei[]; servicos: ServEscrit[]; fechar: () => void }) {
  const nova = !os;
  const [o, setO] = useState<OS>(os ?? vazio());
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<ClienteFin[]>([]);
  const [cobranca, setCobranca] = useState<"salao" | "profissional">("profissional");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [linhas, setLinhas] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState<OS | null>(null);

  useEffect(() => {
    if (!nova) return;
    const t = setTimeout(async () => {
      const q = busca.trim();
      if (q.length < 3) { setAchados([]); return; }
      const dig = q.replace(/\D/g, "");
      const query: Record<string, unknown> = { incluir_empresas: true };
      if (dig.length >= 11) query.cpf_cnpj = dig; else if (/^\d+$/.test(q)) query.codigo = q; else query.nome = q;
      try { setAchados((await ler<{ dados: ClienteFin[] }>("/financeiro/clientes", query)).dados ?? []); } catch { setAchados([]); }
    }, 400);
    return () => clearTimeout(t);
  }, [busca, nova]);

  const m = o.questor ? mei.find((x) => x.cod === Number(o.questor)) : undefined;
  const codSalao = m?.salaoCod && m.salaoCod !== AVULSO ? m.salaoCod : null;
  const podeSalao = !!m?.ativo && !!codSalao;
  const clienteCobrado = cobranca === "salao" && podeSalao ? codSalao! : o.codigo;
  const servs = [o.servico1, o.servico2, o.servico3, o.servico4];
  const vals = [o.valorserv1, o.valorserv2, o.valorserv3, o.valorserv4];
  const totalCalc = vals.reduce<number>((a, v, i) => a + (servs[i] ? Number(v ?? 0) : 0), 0);
  const set = (k: keyof OS, v: unknown) => setO((x) => ({ ...x, [k]: v }));

  function escolherCliente(c: ClienteFin) {
    setO((x) => ({ ...x, codigo: c.codigocliente, questor: c.codigoempresa ?? null, razao: c.nome, cnpj: c.inscrfederal ?? "",
      logradouro: [c.tipologradouro, c.logradouro].filter(Boolean).join(" "), numero: c.numero ?? "", complemento: c.complemento ?? "", bairro: c.bairro ?? "",
      cidade: c.nomemunic ?? "", cep: c.cep ?? "", email: c.email ?? "", celular: c.telefone ?? "" }));
    setAchados([]); setBusca(""); setCobranca("profissional");
  }

  async function escolherServico(i: number, cod: string) {
    const s = servicos.find((x) => String(x.codigo) === cod);
    let valor = s?.valor ?? 0;
    if (FIXOS.includes(Number(cod)) && cobranca === "salao" && codSalao) {
      try {
        const j = await ler<{ dados: Fixo[] }>("/financeiro/servicos-fixos", { salao: codSalao });
        const L = (j.dados ?? []).filter((x) => x.codigoservicoescrit === Number(cod)).sort((a, b) => String(a.competinicialvalid).localeCompare(String(b.competinicialvalid)));
        if (L.length) valor = L[L.length - 1].valor;
      } catch { /* fica a tabela de preço */ }
    }
    setO((x) => ({ ...x, [`servico${i + 1}`]: cod, [`valorserv${i + 1}`]: cod ? valor : null }));
  }

  function camposOS(): Record<string, unknown> {
    const { nos: _n, ...resto } = o;
    void _n;
    return { ...resto, valortt: totalCalc, numero: o.numero === "" ? null : String(o.numero).replace(/\.0$/, "") };
  }

  async function salvar() {
    if (!o.razao || !o.codigo) { setMsg({ ok: false, texto: "Escolha o cliente." }); return; }
    if (!o.cidade || !o.datainicio) { setMsg({ ok: false, texto: "Cidade e início dos trabalhos são obrigatórios (regra do Access)." }); return; }
    if (nova && !o.servico1) { setMsg({ ok: false, texto: "Informe ao menos o serviço 1." }); return; }
    if (!confirm(nova ? "Salvar a O.S. e lançar a cobrança no Questor?" : `Salvar as alterações da O.S. ${o.nos}? (a cobrança no Questor não é alterada, como no Access)`)) return;
    setSalvando(true); setLinhas([]);
    try {
      const r = nova
        ? await api<{ resultado?: OS }>("POST", "/mei/os", { corpo: camposOS(), idempotencia: `osmei-${o.codigo}-${o.data}-${o.servico1}-${totalCalc}` })
        : await api<{ resultado?: OS }>("PATCH", `/mei/os/${o.nos}`, { corpo: camposOS() });
      const res = resumoGravacao(r);
      if (!res.ok) { setMsg(res); return; }
      const gravada = { ...o, ...(r.dados?.resultado ?? {}) } as OS;
      const out = [`O.S. ${gravada.nos ?? ""}: ${res.texto}`];
      // Cobrança no Questor (só na O.S. nova, como o ostroca).
      if (nova && clienteCobrado) {
        for (let i = 0; i < 4; i++) {
          const cod = Number(servs[i]); const valor = Number(vals[i] ?? 0);
          if (!cod || (i > 0 && valor <= 0)) continue;
          const questor = o.questor ?? "";
          const rc = FIXOS.includes(cod)
            ? await api("POST", "/cadastro/servico-fixo", { corpo: { codigocliente: clienteCobrado, codigoservicoescrit: cod, competinicialvalid: o.datainicio, valorservicofixo: valor, periodoservicofixo: PERIODO, compldescr: i === 0 ? `${questor} - ${String(o.razao).slice(0, 40)}` : String(questor), observacaoservicofixo: `${questor} - ${o.razao}`.slice(0, 250), codigoescrit: 1, codigousuario: 19 }, idempotencia: `osmei-${gravada.nos}-fixo-${cod}` })
            : await api("POST", "/cadastro/servico-variavel", { corpo: { codigocliente: clienteCobrado, codigoservicoescrit: cod, dataservvar: o.datainicio, qtdadeservvar: 1, valorunitservvar: valor, observservvar: `${questor} - ${String(o.razao).slice(0, 40)}`, codigoescrit: 1, codigousuario: 19 }, idempotencia: `osmei-${gravada.nos}-var-${cod}` });
          const x = resumoGravacao(rc);
          out.push(`Cobrança serviço ${i + 1} (${cod}, ${FIXOS.includes(cod) ? "fixo mensal" : "variável"}, ${brl(valor)}, cliente ${clienteCobrado}): ${x.ok ? x.texto : mensagemErro(rc)}`);
        }
      }
      setLinhas(out);
      setMsg({ ok: true, texto: r.dryRunForcado ? "Simulação concluída (trava ligada) — nada foi gravado." : "O.S. salva." });
      if (!r.dryRunForcado) setSalvo(gravada);
    } finally { setSalvando(false); }
  }

  const input = (k: keyof OS, label: string, tipo = "text") => (
    <Campo label={label}><input type={tipo} style={st.input} value={String(o[k] ?? "")} onChange={(e) => set(k, e.target.value)} /></Campo>
  );

  return (
    <div style={st.card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button style={st.btn} onClick={fechar}>← Voltar</button>
        <h3 style={{ margin: 0, fontSize: 16 }}>{nova ? "Nova O.S." : `O.S. ${o.nos}`}</h3>
      </div>
      {nova && (
        <div style={{ marginBottom: 12 }}>
          <Campo label="Cliente (cadastro financeiro)"><input style={{ ...st.input, minWidth: 320 }} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome (3+ letras), CPF/CNPJ ou código financeiro" /></Campo>
          {achados.length > 0 && <Tabela cab={["Cód. fin.", "Nome", "CPF/CNPJ", "Cód. empresa", ""]} linhas={achados.slice(0, 20).map((c) => [c.codigocliente, c.nome, c.inscrfederal ?? "", c.codigoempresa ?? "—", <button key="s" style={st.btn} onClick={() => escolherCliente(c)}>Selecionar</button>])} />}
        </div>
      )}
      <div style={st.grid}>
        {input("data", "Data", "date")}
        <Campo label="Tipo"><select style={st.input} value={o.tipo ?? ""} onChange={(e) => set("tipo", e.target.value)}>{[...new Set([...TIPOS, o.tipo ?? ""])].filter(Boolean).map((t) => <option key={t}>{t}</option>)}</select></Campo>
        {input("datainicio", "Início dos trabalhos *", "date")}
        <Campo label="Cód. financeiro"><input style={st.input} readOnly value={o.codigo ?? ""} /></Campo>
        <Campo label="Cód. Questor"><input style={st.input} readOnly value={o.questor ?? ""} /></Campo>
        {input("razao", "Razão social")}{input("cnpj", "CNPJ/CPF")}
        {input("logradouro", "Logradouro")}{input("numero", "Número")}{input("complemento", "Complemento")}{input("bairro", "Bairro")}
        {input("cidade", "Cidade *")}{input("cep", "CEP")}
        {input("contato", "Contato")}{input("email", "E-mail")}{input("telefone", "Telefone")}{input("celular", "Celular")}
        {input("indicacao", "Indicação")}{input("tratadocom", "Tratado com")}{input("usuario", "Colaborador")}
      </div>
      {m && <p style={st.mut}>Salão: <b>{m.salao}</b>{m.bloqueado ? " · BLOQUEADO" : ""} · {m.ativo ? "empresa ativa" : "empresa inativa"}</p>}
      {nova && (
        <div style={st.bar}>
          <label style={{ fontSize: 13 }}><input type="radio" checked={cobranca === "salao"} disabled={!podeSalao} onChange={() => setCobranca("salao")} /> Cobrar no Salão{podeSalao ? ` (${codSalao})` : " (indisponível)"}</label>
          <label style={{ fontSize: 13 }}><input type="radio" checked={cobranca === "profissional"} onChange={() => setCobranca("profissional")} /> Cobrar no Profissional{o.codigo ? ` (${o.codigo})` : ""}</label>
        </div>
      )}
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 10, marginBottom: 8 }}>
          <Campo label={`Serviço ${i + 1}${i === 0 && nova ? " *" : ""}`}>
            <select style={st.input} value={String(servs[i] ?? "")} onChange={(e) => escolherServico(i, e.target.value)}>
              <option value="">—</option>
              {servs[i] && !servicos.some((s) => String(s.codigo) === String(servs[i])) && <option value={String(servs[i])}>{servs[i]}</option>}
              {servicos.filter((s) => /^MEI\s*-/i.test(s.descricao) || FIXOS.includes(s.codigo) || String(s.codigo) === String(servs[i])).map((s) => <option key={s.codigo} value={s.codigo}>{s.codigo} - {s.descricao}{FIXOS.includes(s.codigo) ? " (mensal)" : ""}</option>)}
            </select>
          </Campo>
          <Campo label="Valor"><input style={st.input} value={vals[i] ?? ""} onChange={(e) => set(`valorserv${i + 1}` as keyof OS, num(e.target.value))} /></Campo>
        </div>
      ))}
      <p style={{ fontWeight: 600 }}>Total: {brl(totalCalc)}</p>
      <Campo label="Observações (financeiro)"><textarea style={{ ...st.input, minHeight: 60 }} value={o.obs ?? ""} onChange={(e) => set("obs", e.target.value)} /></Campo>
      <Campo label="Observações gerais"><textarea style={{ ...st.input, minHeight: 60 }} value={o.obsgerais ?? ""} onChange={(e) => set("obsgerais", e.target.value)} /></Campo>
      <div style={{ ...st.bar, marginTop: 10 }}>
        <button style={st.btnP} disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar O.S."}</button>
      </div>
      <Mensagem msg={msg} />
      {linhas.map((l, i) => <p key={i} style={{ fontSize: 13, margin: "4px 0" }}>{l}</p>)}
      {salvo && <Modal titulo={`O.S. ${salvo.nos} salva`} fechar={fechar}><p>Volte à lista para imprimir ou mandar por e-mail (no Access, a O.S. nova vai por e-mail para o Financeiro).</p><button style={st.btnP} onClick={fechar}>Ir para a lista</button></Modal>}
    </div>
  );
}
