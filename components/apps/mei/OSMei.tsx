"use client";

// O.S. do MEI = menuos (lista, editar, imprimir, e-mail) + geraros/ostroca (nova O.S. com cobrança)
// + ostrocamanutencao (editar). Grava em mei.osfinanceiro pela API (/mei/os), a mesma tabela do Access.
// Regras de cobrança do ostroca:
//  - cobrança no Salão (cliente = salão do MEI) ou no Profissional (cliente = cód. financeiro dele);
//    sem empresa ativa no Questor, só no Profissional;
//  - serviço 72/102 no Salão herda o último valor fixo que o salão já paga; os demais vêm da tabela de preço;
//  - 72/102 => SERVICOFIXO mensal; demais => SERVICOVARIAVEL (data = início dos trabalhos).
import { useCallback, useEffect, useState } from "react";
import "@/components/apps/paralegal/controle.css";
import { api, ler, brl, dt, hojeISO, resumoGravacao, mensagemErro, AVULSO, type Mei } from "./ui";
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

  return (
    <div className="controle-app">
      <div className="pl-toolbar">
        <input type="text" placeholder="Buscar por razão social, CNPJ…" value={f.q} onChange={(e) => { setPagina(0); setF({ ...f, q: e.target.value }); }} />
        <input type="date" title="Data de" value={f.de} onChange={(e) => { setPagina(0); setF({ ...f, de: e.target.value }); }} style={{ maxWidth: 160 }} />
        <input type="date" title="Data até" value={f.ate} onChange={(e) => { setPagina(0); setF({ ...f, ate: e.target.value }); }} style={{ maxWidth: 160 }} />
        <select value={f.tipo} onChange={(e) => { setPagina(0); setF({ ...f, tipo: e.target.value }); }} style={{ maxWidth: 170 }}><option value="">Todos os tipos</option>{TIPOS.map((t) => <option key={t}>{t}</option>)}</select>
        <button className="pl-btn" onClick={carregar}>↻ Atualizar</button>
        <button className="pl-btn primary" onClick={() => setEditando("nova")}>+ Nova OS</button>
      </div>
      {erro && <div className="pl-banner error">{erro}</div>}
      {msg && <div className={`pl-banner${msg.ok ? "" : " error"}`}>{msg.texto}</div>}
      <div className="pl-table-wrap">
        <table className="pl-grid">
          <thead><tr><th style={{ whiteSpace: "nowrap" }}>Nº OS</th><th>Tipo</th><th>Razão social</th><th>CNPJ/CPF</th><th>Data</th><th>Cód. Questor</th><th>Cód. fin.</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {lista.map((o) => (
              <tr key={o.nos}>
                <td>{o.nos}</td><td>{o.tipo}</td><td>{o.razao}</td><td style={{ whiteSpace: "nowrap" }}>{o.cnpj}</td><td>{dt(o.data)}</td>
                <td>{o.questor ?? ""}</td><td>{o.codigo ?? ""}</td><td>{brl(Number(o.valortt ?? 0))}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="pl-btn" onClick={() => setEditando(o)}>Editar</button>{" "}
                  <button className="pl-btn" onClick={() => baixarPdf(o, "financeiro")}>PDF Fin.</button>{" "}
                  <button className="pl-btn" onClick={() => baixarPdf(o, "geral")}>PDF Geral</button>{" "}
                  <button className="pl-btn" onClick={() => email(o, "financeiro")}>✉ Fin.</button>{" "}
                  <button className="pl-btn" onClick={() => email(o, "geral")}>✉ Geral</button>
                </td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={9} style={{ textAlign: "center", padding: 20 }}>Nenhuma O.S.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pl-toolbar" style={{ marginTop: 10 }}>
        <button className="pl-btn" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>‹ Anterior</button>
        <span style={{ fontSize: 13 }}>Página {pagina + 1} de {Math.max(1, Math.ceil(total / POR_PAGINA))} · {total} O.S.</span>
        <button className="pl-btn" disabled={(pagina + 1) * POR_PAGINA >= total} onClick={() => setPagina((p) => p + 1)}>Próxima ›</button>
      </div>
      {editando && <FormOS os={editando === "nova" ? null : editando} mei={mei} servicos={servicos} fechar={() => { setEditando(null); carregar(); }} />}
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

  const campo = (k: keyof OS, label: string, tipo = "text", somenteLeitura = false) => (
    <label style={{ marginBottom: 0 }}><span>{label}</span><input type={tipo} readOnly={somenteLeitura} value={String(o[k] ?? "")} onChange={(e) => set(k, e.target.value)} /></label>
  );
  const grade = (n: number, filhos: React.ReactNode) => <div style={{ display: "grid", gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 10, marginBottom: 10 }}>{filhos}</div>;

  return (
    <div className="pl-modal-bg">
      <div className="pl-modal" style={{ maxWidth: 760 }}>
        <button type="button" className="pl-modal-fechar" title="Fechar" aria-label="Fechar" disabled={salvando} onClick={() => { if (confirm("Fechar sem salvar? O que foi preenchido será perdido.")) fechar(); }}>×</button>
        <h3>{nova ? "Nova OS" : `Editar OS ${o.nos}`}</h3>

        {nova && (
          <>
            <h3 style={{ fontSize: 12 }}>Cliente (cadastro financeiro)</h3>
            <div style={{ position: "relative", marginBottom: 16 }}>
              <label style={{ marginBottom: 0 }}><span>Buscar cliente</span>
                <input value={busca} placeholder="Nome (3+ letras), CPF/CNPJ ou código financeiro…" onChange={(e) => setBusca(e.target.value)} />
              </label>
              {achados.length > 0 && (
                <div className="pl-dropdown" style={{ position: "absolute", zIndex: 5, top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid var(--pl-border)", borderRadius: 8, maxHeight: 220, overflowY: "auto", boxShadow: "0 6px 20px rgba(0,0,0,.12)" }}>
                  {achados.slice(0, 30).map((c) => (
                    <div key={c.codigocliente} onClick={() => escolherCliente(c)} style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--pl-border)" }}>
                      <strong>{c.nome}</strong>
                      <div style={{ color: "var(--pl-ink-soft)", fontSize: 12 }}>{c.inscrfederal ?? ""} · Cód. financeiro {c.codigocliente}{c.codigoempresa ? ` · Questor ${c.codigoempresa}` : " · Avulso"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <h3 style={{ fontSize: 12 }}>Dados da OS — Nº {o.nos ?? "(gerado ao salvar)"}</h3>
        {grade(3, <>
          {campo("data", "Data", "date")}
          <label style={{ marginBottom: 0 }}><span>Tipo</span><select value={o.tipo ?? ""} onChange={(e) => set("tipo", e.target.value)}>{[...new Set([...TIPOS, o.tipo ?? ""])].filter(Boolean).map((t) => <option key={t}>{t}</option>)}</select></label>
          {campo("datainicio", "Início dos trabalhos *", "date")}
        </>)}
        {grade(3, <>{campo("codigo", "Cód. financeiro", "text", true)}{campo("questor", "Cód. empresa (Questor)", "text", true)}{campo("cnpj", "CNPJ/CPF")}</>)}
        <label><span>Razão social</span><input value={o.razao ?? ""} onChange={(e) => set("razao", e.target.value)} /></label>
        {m && <p className="pl-cnae-selecionado" style={{ marginTop: -4 }}>Salão: {m.salao}{m.bloqueado ? " · BLOQUEADO" : ""} · {m.ativo ? "empresa ativa" : "empresa inativa"}</p>}

        <h3 style={{ fontSize: 12 }}>Endereço</h3>
        {grade(3, <>{campo("logradouro", "Logradouro")}{campo("numero", "Número")}{campo("complemento", "Complemento")}</>)}
        {grade(3, <>{campo("bairro", "Bairro")}{campo("cidade", "Cidade *")}{campo("cep", "CEP")}</>)}

        <h3 style={{ fontSize: 12 }}>Contato</h3>
        {grade(3, <>{campo("contato", "Contato")}{campo("email", "E-mail")}{campo("telefone", "Telefone")}</>)}
        {grade(3, <>{campo("celular", "Celular")}{campo("indicacao", "Indicação")}{campo("tratadocom", "Tratado com")}</>)}
        {grade(3, <>{campo("usuario", "Colaborador")}</>)}

        <h3 style={{ fontSize: 12 }}>Serviços</h3>
        {nova && (
          <div style={{ display: "flex", gap: 16, fontSize: 13, marginBottom: 10 }}>
            <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><input type="radio" style={{ width: "auto" }} checked={cobranca === "salao"} disabled={!podeSalao} onChange={() => setCobranca("salao")} /> Cobrar no Salão{podeSalao ? ` (${codSalao})` : " (indisponível)"}</span>
            <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><input type="radio" style={{ width: "auto" }} checked={cobranca === "profissional"} onChange={() => setCobranca("profissional")} /> Cobrar no Profissional{o.codigo ? ` (${o.codigo})` : ""}</span>
          </div>
        )}
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 10, marginBottom: 8 }}>
            <label style={{ marginBottom: 0 }}><span>Serviço {i + 1}{i === 0 && nova ? " *" : ""}</span>
              <select value={String(servs[i] ?? "")} onChange={(e) => escolherServico(i, e.target.value)}>
                <option value="">—</option>
                {servs[i] && !servicos.some((s) => String(s.codigo) === String(servs[i])) && <option value={String(servs[i])}>{servs[i]}</option>}
                {servicos.filter((s) => /^MEI\s*-/i.test(s.descricao) || FIXOS.includes(s.codigo) || String(s.codigo) === String(servs[i])).map((s) => <option key={s.codigo} value={s.codigo}>{s.codigo} - {s.descricao}{FIXOS.includes(s.codigo) ? " (mensal)" : ""}</option>)}
              </select>
            </label>
            <label style={{ marginBottom: 0 }}><span>Valor</span><input value={vals[i] ?? ""} onChange={(e) => set(`valorserv${i + 1}` as keyof OS, num(e.target.value))} /></label>
          </div>
        ))}
        <label><span>Valor total</span><input value={brl(totalCalc)} readOnly disabled /></label>
        <label><span>Observações gerais <small style={{ opacity: 0.7 }}>(só no PDF Geral)</small></span><textarea rows={2} value={o.obsgerais ?? ""} onChange={(e) => set("obsgerais", e.target.value)} /></label>
        <label><span>Observações financeiro <small style={{ opacity: 0.7 }}>(só no PDF Financeiro)</small></span><textarea rows={2} value={o.obs ?? ""} onChange={(e) => set("obs", e.target.value)} /></label>

        {msg && <div className={`pl-banner${msg.ok ? "" : " error"}`} style={{ marginTop: 8 }}>{msg.texto}</div>}
        {linhas.map((l, i) => <p key={i} style={{ fontSize: 13, margin: "4px 0" }}>{l}</p>)}
        {salvo && <div className="pl-banner" style={{ marginTop: 8 }}>O.S. {salvo.nos} salva. Feche e use a lista para imprimir ou mandar por e-mail ao Financeiro.</div>}

        <div className="pl-toolbar" style={{ marginTop: 8 }}>
          <button className="pl-btn" onClick={() => { if (confirm("Fechar sem salvar? O que foi preenchido será perdido.")) fechar(); }} disabled={salvando}>Cancelar</button>
          <button className="pl-btn primary" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}
