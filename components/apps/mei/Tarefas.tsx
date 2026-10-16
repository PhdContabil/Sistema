"use client";

// Painel de tarefas MEI = formmenuprincipal + subcon_tarefasmei + obstarefa + avulso +
// gerartarefa (Programação) + for_transferencia + Baixar + Exportar Excel.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api, ler, st, Tabela, Campo, Mensagem, Modal, SelectSalao, useLista, baixarCsv, dt, hojeISO, primeiroDiaMes, ultimoDiaMes,
  resumoGravacao, semHtml, verificarRobo, AvisoRobo, ErroRobo, ROBO_URL, type RoboEstado, type Mei, type Responsavel, type ServicoTarefa,
} from "./ui";

interface Tarefa {
  id: number; codigoempresa: number; razao: string; servico_id: number; servico_descricao: string;
  responsavel_id: number; responsavel_nome: string; competencia: string | null; data_servico: string | null;
  data_entrega: string | null; status: string; validacao: boolean; obs: string | null; salao: string | null;
}
const POR_PAGINA = 100;
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const comp = (s: string | null) => (s ? `${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
const ontemISO = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

interface JobDas { id?: string; status: string; passos: { msg: string }[]; erro?: string }
const DAS_RODANDO = ["preparando", "login", "aguardando_login", "preenchendo"];
const DAS_STATUS: Record<string, string> = {
  preparando: "abrindo o Chrome…", login: "entrando no Simples Nacional…", aguardando_login: "aguardando você resolver a verificação na janela do Chrome",
  preenchendo: "abrindo a guia…", aguardando_confirmacao: "guia aberta — confira e baixe o PDF; feche a janela ao terminar",
  fechada: "janela fechada", erro: "erro", cancelada: "cancelado",
};

/** Roda o robô da guia DAS para uma tarefa. esperarFechar=true (lote): só termina quando a janela do Chrome é fechada. */
async function rodarDAS(t: Tarefa, onJob: (j: JobDas) => void, esperarFechar = false): Promise<"ok" | "falhou"> {
  const rc = await fetch(`/api/mei/nota/credenciais?cod=${t.codigoempresa}&tipo=das`); const jc = await rc.json();
  if (!rc.ok) { onJob({ status: "erro", erro: jc.error ?? "Falha ao buscar o código de acesso.", passos: [] }); return "falhou"; }
  const r = await fetch(`${ROBO_URL}/das`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cod: t.codigoempresa, razao: t.razao, creds: jc.creds }) });
  const j = await r.json();
  if (!r.ok) { onJob({ status: "erro", erro: j.erro ?? "O robô recusou.", passos: [] }); return "falhou"; }
  onJob(j);
  let abriu = false;
  for (let i = 0; i < 2400; i++) {
    await new Promise((ok) => setTimeout(ok, 1500));
    const s: JobDas | null = await (await fetch(`${ROBO_URL}/jobs/${j.id}`)).json().catch(() => null);
    if (!s) return abriu ? "ok" : "falhou";
    onJob(s);
    if (s.status === "aguardando_confirmacao") { abriu = true; if (!esperarFechar) return "ok"; continue; }
    if (!DAS_RODANDO.includes(s.status)) return abriu ? "ok" : "falhou";
  }
  return abriu ? "ok" : "falhou";
}

function PainelDas({ job, titulo }: { job: JobDas | null; titulo?: string }) {
  if (!job) return null;
  return (
    <div style={{ ...st.mut, marginTop: 8, padding: "8px 10px", background: "var(--accent-soft)", borderRadius: 8 }}>
      <b>{titulo ?? "Robô DAS"}: {DAS_STATUS[job.status] ?? job.status}</b>
      {job.erro && <ErroRobo erro={job.erro} jobId={job.id} passos={job.passos} contexto={`Guia DAS (PGMEI)${titulo ? " — " + titulo : ""}`} />}
      {job.passos.slice(-4).map((p, i) => <div key={i}>• {p.msg}</div>)}
    </div>
  );
}

export default function Tarefas({ mei }: { mei: Mei[] }) {
  const resp = useLista<Responsavel>("/mei/responsaveis");
  const serv = useLista<ServicoTarefa>("/mei/servicos");
  const [f, setF] = useState({ salao: "", de: primeiroDiaMes(), ate: ultimoDiaMes(), status: "Em Aberto", responsavel_id: "", servico_id: "", codigoempresa: "", razao: "" });
  const [pagina, setPagina] = useState(0);
  const [dados, setDados] = useState<Tarefa[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [modal, setModal] = useState<"" | "avulso" | "programacao" | "transferencia" | "ajuda">("");
  const [obs, setObs] = useState<Tarefa | null>(null);
  const [vencidas, setVencidas] = useState<Tarefa[]>([]);
  const [lote, setLote] = useState<{ atual: number; total: number; razao: string; job: JobDas | null; parar: boolean } | null>(null);
  const [roboEstado, setRoboEstado] = useState<RoboEstado>("ok");

  const filtroApi = useMemo(() => ({
    de: f.de, ate: f.ate, status: f.status || undefined, responsavel_id: f.responsavel_id || undefined,
    servico_id: f.servico_id || undefined, codigoempresa: f.codigoempresa || undefined, razao: f.razao || undefined, salao: f.salao || undefined,
  }), [f]);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const j = await ler<{ dados: Tarefa[]; total_geral: number }>("/mei/tarefas", { ...filtroApi, limit: POR_PAGINA, offset: pagina * POR_PAGINA });
      setDados(j.dados ?? []); setTotal(j.total_geral ?? 0);
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar tarefas."); }
    finally { setCarregando(false); }
  }, [filtroApi, pagina]);

  useEffect(() => { carregar(); }, [carregar]);
  // Aviso de vencidas: tarefas em aberto com data de serviço até ontem (independe do filtro da tela).
  const carregarVencidas = useCallback(async () => {
    try {
      const j = await ler<{ dados: Tarefa[] }>("/mei/tarefas", { status: "Em Aberto", de: "2000-01-01", ate: ontemISO(), limit: 1000 });
      setVencidas(j.dados ?? []);
    } catch { setVencidas([]); }
  }, []);
  useEffect(() => { carregarVencidas(); }, [carregarVencidas, dados]);
  const vencidasPorResp = useMemo(() => {
    const m = new Map<string, { id: number; nome: string; n: number }>();
    for (const v of vencidas) { const k = String(v.responsavel_id); const x = m.get(k) ?? { id: v.responsavel_id, nome: v.responsavel_nome || "Sem responsável", n: 0 }; x.n++; m.set(k, x); }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [vencidas]);
  const verVencidas = (responsavel_id?: number) => setF((x) => ({ ...x, status: "Em Aberto", de: "2000-01-01", ate: ontemISO(), responsavel_id: responsavel_id ? String(responsavel_id) : "" }));
  // Igual ao Access: mudar filtro desmarca a seleção.
  useEffect(() => { setSel(new Set()); setPagina(0); }, [filtroApi]);

  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const alternar = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todasMarcadas = dados.length > 0 && dados.every((t) => sel.has(t.id));

  async function baixarSelecionadas() {
    const ids = [...sel];
    if (!ids.length) { setMsg({ ok: false, texto: "Marque as tarefas que deseja baixar." }); return; }
    if (!confirm(`Baixar ${ids.length} tarefa(s)? (data de entrega = hoje, status = Encerrado)`)) return;
    // A API só baixa onde validacao=true (regra do Access): marca e depois baixa.
    const r1 = await api("POST", "/mei/tarefas/lote", { corpo: { acao: "selecionar", ids, validacao: true } });
    if (r1.status >= 300) { setMsg(resumoGravacao(r1)); return; }
    const r2 = await api<{ afetadas?: number }>("POST", "/mei/tarefas/lote", { corpo: { acao: "baixar", ids } });
    const m = resumoGravacao(r2);
    setMsg({ ...m, texto: `${m.texto}${r2.status < 300 ? ` Tarefas afetadas: ${(r2.dados as { afetadas?: number })?.afetadas ?? "?"}.` : ""}` });
    if (r2.status < 300 && !r2.dryRunForcado) { setSel(new Set()); carregar(); }
  }

  async function exportar() {
    setMsg({ ok: true, texto: "Gerando planilha…" });
    const todas: Tarefa[] = [];
    for (let off = 0; off < 20000; off += 1000) {
      const j = await ler<{ dados: Tarefa[]; total_geral: number }>("/mei/tarefas", { ...filtroApi, limit: 1000, offset: off });
      todas.push(...(j.dados ?? []));
      if (todas.length >= (j.total_geral ?? 0) || !(j.dados ?? []).length) break;
    }
    baixarCsv("tarefas_mei.csv", ["Razão", "Serviço", "Competência", "Data serviço", "Data entrega", "Obs", "Responsável", "Status"],
      todas.map((t) => [`${t.codigoempresa} - ${t.razao}`, t.servico_descricao, comp(t.competencia), dt(t.data_servico), dt(t.data_entrega), semHtml(t.obs), t.responsavel_nome, t.status]));
    setMsg(null);
  }

  // Guia DAS em lote: abre uma guia por vez; a próxima começa quando você fecha a janela do Chrome.
  const dasSelecionadas = dados.filter((x) => sel.has(x.id) && x.servico_id === 6 && x.status !== "Encerrado");
  async function dasEmLote() {
    if (!dasSelecionadas.length) { setMsg({ ok: false, texto: "Marque tarefas de guia DAS em aberto." }); return; }
    const estado = await verificarRobo(); setRoboEstado(estado);
    if (estado !== "ok") return;
    if (!confirm(`Emitir ${dasSelecionadas.length} guia(s) DAS? O robô abre uma por vez: confira/baixe o PDF e FECHE a janela do Chrome para ir para a próxima.`)) return;
    const feitas: number[] = [];
    let parar = false;
    for (let i = 0; i < dasSelecionadas.length && !parar; i++) {
      const tf = dasSelecionadas[i];
      setLote({ atual: i + 1, total: dasSelecionadas.length, razao: `${tf.codigoempresa} - ${tf.razao}`, job: null, parar: false });
      const res = await rodarDAS(tf, (job) => setLote((l) => { if (l?.parar) parar = true; return l ? { ...l, job } : l; }), true);
      if (res === "ok") feitas.push(tf.id);
    }
    setLote(null);
    if (!feitas.length) { setMsg({ ok: false, texto: "Nenhuma guia foi aberta." }); return; }
    if (confirm(`${feitas.length} guia(s) aberta(s). Baixar essas tarefas? (entrega = hoje)`)) {
      const r1 = await api("POST", "/mei/tarefas/lote", { corpo: { acao: "selecionar", ids: feitas, validacao: true } });
      const r2 = r1.status < 300 ? await api("POST", "/mei/tarefas/lote", { corpo: { acao: "baixar", ids: feitas } }) : r1;
      setMsg(resumoGravacao(r2));
      if (r2.status < 300 && !r2.dryRunForcado) { setSel(new Set()); carregar(); }
    } else setMsg({ ok: true, texto: `${feitas.length} guia(s) aberta(s). Tarefas não baixadas.` });
  }

  const ativos = mei.filter((m) => m.ativo).sort((a, b) => a.razao.localeCompare(b.razao));

  return (
    <div>
      <div style={st.card}>
        <div style={st.bar}>
          <SelectSalao mei={mei} valor={f.salao} onChange={set("salao")} />
          <Campo label="De"><input type="date" style={st.input} value={f.de} onChange={(e) => set("de")(e.target.value)} /></Campo>
          <Campo label="Até"><input type="date" style={st.input} value={f.ate} onChange={(e) => set("ate")(e.target.value)} /></Campo>
          <Campo label="Status"><select style={st.input} value={f.status} onChange={(e) => set("status")(e.target.value)}><option value="">Todos</option><option>Em Aberto</option><option>Encerrado</option></select></Campo>
          <Campo label="Responsável"><select style={st.input} value={f.responsavel_id} onChange={(e) => set("responsavel_id")(e.target.value)}><option value="">Todos</option>{resp.dados.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select></Campo>
          <Campo label="Serviço"><select style={{ ...st.input, maxWidth: 260 }} value={f.servico_id} onChange={(e) => set("servico_id")(e.target.value)}><option value="">Todos</option>{[...serv.dados].sort((a, b) => a.descricao.localeCompare(b.descricao)).map((s) => <option key={s.id} value={s.id}>{s.descricao}</option>)}</select></Campo>
          <Campo label="Empresa (nome)"><input style={st.input} value={f.razao} onChange={(e) => set("razao")(e.target.value)} placeholder="Trecho da razão" /></Campo>
          <Campo label="Cód."><input style={{ ...st.input, width: 80 }} value={f.codigoempresa} onChange={(e) => set("codigoempresa")(e.target.value.replace(/\D/g, ""))} /></Campo>
        </div>
        <div style={st.bar}>
          <button style={st.btnP} onClick={baixarSelecionadas}>Baixar selecionadas ({sel.size})</button>
          <button style={st.btn} onClick={() => setModal("avulso")}>+ Avulso</button>
          <button style={st.btn} onClick={() => setModal("programacao")}>Programação</button>
          <button style={st.btn} onClick={() => setModal("transferencia")}>Transferência</button>
        <button style={st.btn} onClick={() => setModal("ajuda")}>? Como funciona</button>
          <button style={st.btn} onClick={exportar}>Exportar Excel (CSV)</button>
          <button style={st.btn} onClick={dasEmLote} disabled={!!lote}>Emitir DAS das selecionadas ({dasSelecionadas.length})</button>
          <span style={{ flex: 1 }} />
          <span style={st.mut}>{carregando ? "Carregando…" : `${total} tarefa(s)`}</span>
        </div>
        {vencidasPorResp.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "6px 0 10px", padding: "8px 10px", borderRadius: 10, background: "rgba(220, 38, 38, 0.08)", border: "1px solid rgba(220, 38, 38, 0.25)" }}>
            <b style={{ color: "var(--div)" }}>⚠ {vencidas.length} tarefa(s) vencida(s):</b>
            {vencidasPorResp.map((r) => (
              <button key={r.id} style={{ ...st.btn, padding: "3px 10px" }} onClick={() => verVencidas(r.id)}>{r.nome}: <b>{r.n}</b></button>
            ))}
            <button style={{ ...st.btn, padding: "3px 10px" }} onClick={() => verVencidas()}>Ver todas</button>
          </div>
        )}
        <AvisoRobo estado={roboEstado} fechar={() => setRoboEstado("ok")} />
        {lote && (
          <div>
            <PainelDas job={lote.job} titulo={`Guia ${lote.atual} de ${lote.total} — ${lote.razao}`} />
            <button style={{ ...st.btn, marginTop: 6 }} onClick={() => setLote((l) => (l ? { ...l, parar: true } : l))}>Parar depois desta</button>
          </div>
        )}
        <Mensagem msg={msg} />
        {erro && <p style={{ color: "var(--div)" }}>{erro}</p>}
        <Tabela
          cab={[<input key="t" type="checkbox" checked={todasMarcadas} onChange={() => setSel(todasMarcadas ? new Set() : new Set(dados.map((t) => t.id)))} title="Selecionar todas da página" /> as unknown as string,
            "Nº", "Responsável", "Serviço", "Empresa", "Salão", "Competência", "Data serviço", "Entrega", "Status", ""]}
          linhas={dados.map((t) => [
            <input key="c" type="checkbox" checked={sel.has(t.id)} onChange={() => alternar(t.id)} />,
            t.id, t.responsavel_nome, t.servico_descricao, `${t.codigoempresa} - ${t.razao}`, t.salao ?? "", comp(t.competencia),
            dt(t.data_servico), dt(t.data_entrega), t.status,
            <button key="o" style={st.btn} onClick={() => setObs(t)}>Obs{t.obs ? " •" : ""}</button>,
          ])}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
          <button style={st.btn} disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>‹ Anterior</button>
          <span style={st.mut}>Página {pagina + 1} de {Math.max(1, Math.ceil(total / POR_PAGINA))}</span>
          <button style={st.btn} disabled={(pagina + 1) * POR_PAGINA >= total} onClick={() => setPagina((p) => p + 1)}>Próxima ›</button>
        </div>
      </div>

      {obs && <ObsTarefa t={obs} fechar={() => setObs(null)} aoSalvar={carregar} />}
      {modal === "avulso" && <Avulso ativos={ativos} resp={resp.dados.filter((r) => r.ativo)} serv={serv.dados.filter((s) => s.ativo)} fechar={() => setModal("")} aoSalvar={carregar} />}
      {modal === "programacao" && <Programacao ativos={ativos} resp={resp.dados.filter((r) => r.ativo)} serv={serv.dados.filter((s) => s.ativo)} fechar={() => setModal("")} aoSalvar={carregar} />}
      {modal === "ajuda" && <AjudaTarefas fechar={() => setModal("")} />}
      {modal === "transferencia" && <Transferencia filtro={filtroApi} total={total} resp={resp.dados.filter((r) => r.ativo)} fechar={() => setModal("")} aoSalvar={carregar} />}
    </div>
  );
}

function ObsTarefa({ t, fechar, aoSalvar }: { t: Tarefa; fechar: () => void; aoSalvar: () => void }) {
  const [texto, setTexto] = useState(semHtml(t.obs));
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  async function salvar() {
    const r = await api("PATCH", `/mei/tarefas/${t.id}`, { corpo: { obs: texto } });
    setMsg(resumoGravacao(r));
    if (r.status < 300 && !r.dryRunForcado) aoSalvar();
  }
  const [das, setDas] = useState<JobDas | null>(null);
  const [roboEstado, setRoboEstado] = useState<RoboEstado>("ok");
  async function emitirGuia() {
    setMsg(null);
    const estado = await verificarRobo(); setRoboEstado(estado);
    if (estado !== "ok") return;
    const res = await rodarDAS(t, setDas);
    if (res === "ok" && t.status !== "Encerrado" && confirm("Guia aberta. Baixar a tarefa?")) await baixar(true);
  }
  async function baixar(direto = false) {
    if (!direto && !confirm("Baixar esta tarefa? (entrega = hoje)")) return;
    const r = await api("PATCH", `/mei/tarefas/${t.id}`, { corpo: { status: "Encerrado" } });
    setMsg(resumoGravacao(r));
    if (r.status < 300 && !r.dryRunForcado) aoSalvar();
  }
  return (
    <Modal titulo={`Observação — tarefa ${t.id}`} fechar={fechar}>
      <p style={st.mut}><b>{t.codigoempresa} - {t.razao}</b> · {t.servico_descricao} · competência {comp(t.competencia)}</p>
      <textarea style={{ ...st.input, width: "100%", minHeight: 160 }} value={texto} onChange={(e) => setTexto(e.target.value)} />
      <div style={{ ...st.bar, marginTop: 10 }}>
        <button style={st.btnP} onClick={salvar}>Salvar observação</button>
        {t.status !== "Encerrado" && <button style={st.btn} onClick={() => baixar()}>Baixar tarefa</button>}
        {t.servico_id === 6 && <button style={st.btn} onClick={emitirGuia} disabled={!!das && DAS_RODANDO.includes(das.status)}>Emitir guia DAS (robô)</button>}
      </div>
      <AvisoRobo estado={roboEstado} fechar={() => setRoboEstado("ok")} />
      <PainelDas job={das} />
      <Mensagem msg={msg} />
    </Modal>
  );
}

function SelectEmpresa({ ativos, valor, onChange }: { ativos: Mei[]; valor: string; onChange: (v: string) => void }) {
  return (
    <Campo label="Empresa (MEI ativo)">
      <select style={{ ...st.input, width: "100%" }} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione…</option>
        {ativos.map((m) => <option key={m.cod} value={m.cod}>{m.cod} - {m.razao}</option>)}
      </select>
    </Campo>
  );
}

function Avulso({ ativos, resp, serv, fechar, aoSalvar }: { ativos: Mei[]; resp: Responsavel[]; serv: ServicoTarefa[]; fechar: () => void; aoSalvar: () => void }) {
  const [d, setD] = useState({ codigoempresa: "", responsavel_id: "", servico_id: "", competencia: hojeISO().slice(0, 7), data_servico: hojeISO(), obs: "" });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  async function gerar() {
    if (!d.codigoempresa || !d.responsavel_id || !d.servico_id) { setMsg({ ok: false, texto: "Empresa, responsável e serviço são obrigatórios." }); return; }
    if (!confirm("Gerar a tarefa avulsa?")) return;
    const r = await api("POST", "/mei/tarefas", { corpo: { codigoempresa: +d.codigoempresa, responsavel_id: +d.responsavel_id, servico_id: +d.servico_id, competencia: d.competencia ? `${d.competencia}-01` : undefined, data_servico: d.data_servico || undefined, obs: d.obs || undefined } });
    setMsg(resumoGravacao(r));
    if (r.status < 300 && !r.dryRunForcado) { aoSalvar(); }
  }
  return (
    <Modal titulo="Gerar tarefa avulsa" fechar={fechar}>
      <SelectEmpresa ativos={ativos} valor={d.codigoempresa} onChange={(v) => setD({ ...d, codigoempresa: v })} />
      <div style={{ ...st.grid, marginTop: 10 }}>
        <Campo label="Responsável"><select style={st.input} value={d.responsavel_id} onChange={(e) => setD({ ...d, responsavel_id: e.target.value })}><option value="">Selecione…</option>{resp.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select></Campo>
        <Campo label="Serviço"><select style={st.input} value={d.servico_id} onChange={(e) => setD({ ...d, servico_id: e.target.value })}><option value="">Selecione…</option>{serv.map((s) => <option key={s.id} value={s.id}>{s.descricao}</option>)}</select></Campo>
        <Campo label="Competência"><input type="month" style={st.input} value={d.competencia} onChange={(e) => setD({ ...d, competencia: e.target.value })} /></Campo>
        <Campo label="Data da tarefa"><input type="date" style={st.input} value={d.data_servico} onChange={(e) => setD({ ...d, data_servico: e.target.value })} /></Campo>
      </div>
      <Campo label="Observação"><textarea style={{ ...st.input, minHeight: 80 }} value={d.obs} onChange={(e) => setD({ ...d, obs: e.target.value })} /></Campo>
      <div style={{ ...st.bar, marginTop: 10 }}><button style={st.btnP} onClick={gerar}>Gerar</button></div>
      <Mensagem msg={msg} />
    </Modal>
  );
}

function Programacao({ ativos, resp, serv, fechar, aoSalvar }: { ativos: Mei[]; resp: Responsavel[]; serv: ServicoTarefa[]; fechar: () => void; aoSalvar: () => void }) {
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [meses, setMeses] = useState<Set<number>>(new Set());
  const [d, setD] = useState({ codigoempresa: "", responsavel_id: "", servico_id: "" });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [res, setRes] = useState<{ criadas?: unknown[]; ignoradas?: unknown[] } | null>(null);
  async function gerar() {
    if (!ano || !d.codigoempresa || !d.servico_id || !d.responsavel_id) { setMsg({ ok: false, texto: "Ano, empresa, serviço e responsável são obrigatórios." }); return; }
    if (!meses.size) { setMsg({ ok: false, texto: "Marque ao menos um mês." }); return; }
    const r = await api<{ criadas?: unknown[]; ignoradas?: unknown[] }>("POST", "/mei/tarefas/gerar", { corpo: { codigoempresa: +d.codigoempresa, servico_id: +d.servico_id, responsavel_id: +d.responsavel_id, ano: +ano, meses: [...meses].sort((a, b) => a - b) } });
    setMsg(resumoGravacao(r));
    if (r.status < 300) { setRes(r.dados); if (!r.dryRunForcado) aoSalvar(); }
  }
  return (
    <Modal titulo="Programação de tarefas" fechar={fechar} largura={720}>
      <div style={st.grid}>
        <Campo label="Ano"><input style={st.input} value={ano} onChange={(e) => setAno(e.target.value.replace(/\D/g, "").slice(0, 4))} /></Campo>
        <Campo label="Serviço"><select style={st.input} value={d.servico_id} onChange={(e) => setD({ ...d, servico_id: e.target.value })}><option value="">Selecione…</option>{serv.map((s) => <option key={s.id} value={s.id}>{s.descricao}{s.dia_prazo_interno ? ` (dia ${s.dia_prazo_interno})` : " (sem prazo interno)"}</option>)}</select></Campo>
        <Campo label="Responsável"><select style={st.input} value={d.responsavel_id} onChange={(e) => setD({ ...d, responsavel_id: e.target.value })}><option value="">Selecione…</option>{resp.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select></Campo>
      </div>
      <SelectEmpresa ativos={ativos} valor={d.codigoempresa} onChange={(v) => setD({ ...d, codigoempresa: v })} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "12px 0" }}>
        <label style={{ fontSize: 13 }}><input type="checkbox" checked={meses.size === 12} onChange={(e) => setMeses(e.target.checked ? new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) : new Set())} /> Todos</label>
        {MESES.map((m, i) => (
          <label key={m} style={{ fontSize: 13 }}><input type="checkbox" checked={meses.has(i + 1)} onChange={() => setMeses((s) => { const n = new Set(s); if (n.has(i + 1)) n.delete(i + 1); else n.add(i + 1); return n; })} /> {m}</label>
        ))}
      </div>
      <button style={st.btnP} onClick={gerar}>Gerar</button>
      <Mensagem msg={msg} />
      {res && <p style={st.mut}>Criadas: {res.criadas?.length ?? 0} · Ignoradas (já existiam): {res.ignoradas?.length ?? 0}</p>}
    </Modal>
  );
}

function Transferencia({ filtro, total, resp, fechar, aoSalvar }: { filtro: Record<string, unknown>; total: number; resp: Responsavel[]; fechar: () => void; aoSalvar: () => void }) {
  const [destino, setDestino] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  async function confirmar() {
    if (!destino) { setMsg({ ok: false, texto: "Escolha o responsável de destino." }); return; }
    const limpo = Object.fromEntries(Object.entries(filtro).filter(([, v]) => v !== undefined && v !== ""));
    const r = await api<{ afetadas?: number }>("POST", "/mei/tarefas/lote", { corpo: { acao: "transferir", filtro: limpo, responsavel_id: +destino } });
    const m = resumoGravacao(r);
    setMsg({ ...m, texto: `${m.texto}${r.status < 300 ? ` Tarefas afetadas: ${(r.dados as { afetadas?: number })?.afetadas ?? "?"}.` : ""}` });
    if (r.status < 300 && !r.dryRunForcado) aoSalvar();
  }
  return (
    <Modal titulo="Transferência de tarefas" fechar={fechar}>
      <div style={st.aviso}>Transfere para o responsável escolhido TODAS as tarefas em aberto que batem com os filtros atuais do painel ({total} no filtro). No Access, só Carla, Eduardo e Gabriel podiam usar.</div>
      <Campo label="Novo responsável"><select style={st.input} value={destino} onChange={(e) => setDestino(e.target.value)}><option value="">Selecione…</option>{resp.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select></Campo>
      <div style={{ ...st.bar, marginTop: 10 }}><button style={st.btnP} onClick={confirmar}>Confirmar</button></div>
      <Mensagem msg={msg} />
    </Modal>
  );
}

/** Guia rápido da tela de Tarefas (para a equipe do MEI). */
function AjudaTarefas({ fechar }: { fechar: () => void }) {
  const item = (titulo: string, texto: string) => (<div style={{ marginBottom: 12 }}><b>{titulo}</b><p style={{ margin: "4px 0 0", fontSize: 13 }}>{texto}</p></div>);
  return (
    <Modal titulo="Tarefas — como funciona" fechar={fechar} largura={720}>
      {item("O que é uma tarefa", "Cada serviço que precisa ser feito para um MEI numa competência (ex.: DAS 10/2026, Senha NF). A tarefa nasce \"Em Aberto\" e sai da lista quando é baixada.")}
      {item("Vencidas", "Tarefas em aberto com data de entrega já passada. Aparecem em vermelho e no aviso do topo — priorize essas.")}
      {item("Como adicionar uma tarefa única — \"+ Avulso\"", "Escolha o MEI, o serviço, o responsável e a competência, e clique em Gerar. Use para um pedido pontual do cliente.")}
      {item("Como criar as tarefas recorrentes — \"Programação\"", "Escolha o MEI e o serviço; o sistema cria as tarefas das próximas competências (como o gerartarefa do Access). Tarefas que já existem são ignoradas, não duplica.")}
      {item("Dar baixa", "Marque as tarefas feitas na lista e clique em Baixar (uma ou várias de uma vez). A baixa grava de verdade e some da lista de abertas.")}
      {item("DAS em lote", "Marque as tarefas de DAS e use o botão de DAS: o robô do seu computador gera as guias. Se o robô estiver desatualizado, a tela avisa e mostra como instalar.")}
      {item("Observação", "O botão Obs abre a observação da tarefa (o ponto • indica que já tem texto). Salve para gravar.")}
      {item("Transferência", "Passa as tarefas do filtro atual para outro responsável — útil em férias ou troca de carteira.")}
      {item("Exportar", "Gera a planilha (CSV/Excel) com as tarefas do filtro.")}
      <p style={st.mut}>Dúvida ou erro? Abra um chamado na T.I. pelo Núcleo.</p>
    </Modal>
  );
}
