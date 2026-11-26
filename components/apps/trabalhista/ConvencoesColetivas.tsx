"use client";

// Trabalhista › Convenções Coletivas.
// - Cadastro de sindicatos (nome + CNPJ, UF).
// - Pesquisas: escolhe o sindicato e os tipos (convenção, acordo, aditivos), agenda a data e,
//   se quiser, repete a cada N dias até achar ("tentativas programadas").
// - "Abrir no Mediador": o robô local abre o Chrome com a consulta preenchida (uma aba por tipo).
//   Quem clica em "Pesquisar" é a pessoa — a tela do Mediador tem reCAPTCHA.
// - Depois a pessoa marca: encontrada / não encontrada (reagenda se tiver repetição).
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { st, Campo, Tabela, Modal, dt, fmtDoc, verificarRobo, AvisoRobo, ErroRobo, ROBO_URL, type RoboEstado } from "../mei/ui";

interface Sindicato { id: number; nome: string; cnpj: string | null; uf: string | null; observacao: string | null; ativo: boolean }
interface Pesquisa {
  id: number; sindicato_id: number; tipos: string[]; vigencia: string | null; uf: string | null; agendada_para: string | null;
  repetir_dias: number | null; status: string; resultado: string | null; tentativas: number; criado_por: string | null; feita_por: string | null; feita_em: string | null;
}
const TIPOS: [string, string][] = [
  ["convencao", "Convenção Coletiva"], ["acordo", "Acordo Coletivo"],
  ["termoAditivoConvecao", "Aditivo de Convenção"], ["termoAditivoAcordo", "Aditivo de Acordo"],
];
const NOME_TIPO = Object.fromEntries(TIPOS);
const VIGENCIA: [string, string][] = [["1", "Vigentes"], ["2", "Todas"], ["0", "Não vigentes"]];
const STATUS: Record<string, [string, string]> = {
  pendente: ["Pendente", "var(--accent, #2b6cb0)"], encontrada: ["Encontrada", "var(--ok)"],
  nao_encontrada: ["Não encontrada", "var(--div)"], cancelada: ["Cancelada", "var(--muted, #888)"],
};
const UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" ");
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

async function post(corpo: unknown) {
  const r = await fetch("/api/trabalhista/cct", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `Erro ${r.status}`);
  return j;
}

export default function ConvencoesColetivas() {
  const [aba, setAba] = useState<"pesquisas" | "sindicatos">("pesquisas");
  const [sind, setSind] = useState<Sindicato[]>([]);
  const [pesq, setPesq] = useState<Pesquisa[]>([]);
  const [info, setInfo] = useState("Carregando…");
  const [editSind, setEditSind] = useState<Partial<Sindicato> | null>(null);
  const [editPesq, setEditPesq] = useState<Partial<Pesquisa> | null>(null);
  const [resultado, setResultado] = useState<{ p: Pesquisa; obs: string } | null>(null);
  const [filtroP, setFiltroP] = useState<"abertas" | "todas">("abertas");
  const [busca, setBusca] = useState("");
  const [roboEstado, setRoboEstado] = useState<RoboEstado>("ok");
  const [robo, setRobo] = useState<{ id?: string; status: string; passos: { msg: string }[]; erro?: string; contexto: string } | null>(null);
  const [erro, setErro] = useState("");

  async function carregar() {
    try {
      const r = await fetch("/api/trabalhista/cct", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setInfo(j.error ?? `Erro ${r.status}`); return; }
      setSind(j.sindicatos ?? []); setPesq(j.pesquisas ?? []); setInfo("");
    } catch (e) { setInfo(e instanceof Error ? e.message : "Falha ao carregar."); }
  }
  useEffect(() => { void carregar(); }, []);

  const porId = useMemo(() => new Map(sind.map((s) => [s.id, s])), [sind]);
  const venceHoje = pesq.filter((p) => p.status === "pendente" && (p.agendada_para ?? "") <= hoje()).length;
  const listaP = pesq.filter((p) => {
    if (filtroP === "abertas" && p.status !== "pendente") return false;
    const s = porId.get(p.sindicato_id);
    const t = busca.trim().toLowerCase(), d = busca.replace(/\D/g, "");
    return !t || (s?.nome ?? "").toLowerCase().includes(t) || (d.length >= 3 && (s?.cnpj ?? "").includes(d));
  }).sort((a, b) => (a.status === "pendente" ? 0 : 1) - (b.status === "pendente" ? 0 : 1) || String(a.agendada_para).localeCompare(String(b.agendada_para)));
  const listaS = sind.filter((s) => {
    const t = busca.trim().toLowerCase(), d = busca.replace(/\D/g, "");
    return !t || s.nome.toLowerCase().includes(t) || (d.length >= 3 && (s.cnpj ?? "").includes(d));
  });

  async function abrirMediador(s: Sindicato, tipos: string[], vigencia?: string | null, uf?: string | null) {
    setErro("");
    const estado = await verificarRobo();
    setRoboEstado(estado);
    if (estado !== "ok") return;
    const contexto = `Consulta no Mediador — ${s.nome}${s.cnpj ? ` (${fmtDoc(s.cnpj)})` : ""}`;
    try {
      const r = await fetch(`${ROBO_URL}/mediador`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        nome: s.nome, cnpj: s.cnpj, tipos, vigencia: vigencia ?? "1", uf: uf ?? "",
      }) });
      const j = await r.json();
      if (!r.ok) { setRobo({ status: "erro", erro: j.erro ?? "O robô recusou.", passos: [], contexto }); return; }
      setRobo({ ...j, contexto });
      const t = setInterval(async () => {
        try {
          const s2 = await (await fetch(`${ROBO_URL}/jobs/${j.id}`)).json();
          setRobo({ ...s2, contexto });
          if (!["preparando", "preenchendo"].includes(s2.status)) clearInterval(t);
        } catch { clearInterval(t); }
      }, 1500);
    } catch { setRoboEstado("ausente"); }
  }

  async function salvarSind() {
    if (!editSind) return;
    try { await post({ acao: "sindicato", dados: editSind }); setEditSind(null); await carregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : "Falha."); }
  }
  async function salvarPesq() {
    if (!editPesq) return;
    try { await post({ acao: "pesquisa", dados: editPesq }); setEditPesq(null); await carregar(); setAba("pesquisas"); }
    catch (e) { setErro(e instanceof Error ? e.message : "Falha."); }
  }
  async function marcar(r: "encontrada" | "nao_encontrada" | "cancelada") {
    if (!resultado) return;
    try { await post({ acao: "resultado", id: resultado.p.id, resultado: r, obs: resultado.obs }); setResultado(null); await carregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : "Falha."); }
  }
  async function excluir(acao: "excluir_sindicato" | "excluir_pesquisa", id: number, texto: string) {
    if (!confirm(texto)) return;
    try { await post({ acao, id }); await carregar(); } catch (e) { setErro(e instanceof Error ? e.message : "Falha."); }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button style={aba === "pesquisas" ? st.btnP : st.btn} onClick={() => setAba("pesquisas")}>Pesquisas{venceHoje ? ` (${venceHoje} para hoje)` : ""}</button>
        <button style={aba === "sindicatos" ? st.btnP : st.btn} onClick={() => setAba("sindicatos")}>Sindicatos ({sind.length})</button>
        <input style={{ ...st.input, maxWidth: 280, marginLeft: "auto" }} placeholder="Buscar sindicato por nome ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {info && <p style={st.mut}>{info}</p>}
      {erro && <p style={{ color: "var(--div)" }}>{erro}</p>}
      <AvisoRobo estado={roboEstado} fechar={() => setRoboEstado("ok")} />
      {robo && (
        <div style={{ ...st.card, borderLeft: "4px solid var(--accent, #2b6cb0)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <b>{({ preparando: "Abrindo o Chrome…", preenchendo: "Preenchendo a consulta…", aguardando_confirmacao: "PRONTO — clique em \"Pesquisar\" em cada aba do Mediador.", erro: "Erro no robô", fechada: "Janela do Chrome fechada", cancelada: "Cancelado" } as Record<string, string>)[robo.status] ?? robo.status}</b>
            <button style={st.btn} onClick={() => setRobo(null)}>Fechar</button>
          </div>
          <p style={{ ...st.mut, margin: "4px 0" }}>{robo.contexto}</p>
          {robo.erro && <ErroRobo erro={robo.erro} jobId={robo.id} passos={robo.passos} contexto={robo.contexto} />}
          {robo.passos.slice(-4).map((p, i) => <p key={i} style={{ ...st.mut, margin: "2px 0" }}>• {p.msg}</p>)}
        </div>
      )}

      {aba === "pesquisas" && (
        <div style={st.card}>
          <div style={{ ...st.bar, marginBottom: 10 }}>
            <button style={st.btnP} disabled={!sind.length} onClick={() => setEditPesq({ tipos: ["convencao", "termoAditivoConvecao"], vigencia: "1", agendada_para: hoje(), repetir_dias: null })}>Nova pesquisa</button>
            <select style={{ ...st.input, maxWidth: 180 }} value={filtroP} onChange={(e) => setFiltroP(e.target.value as "abertas" | "todas")}>
              <option value="abertas">Só pendentes</option><option value="todas">Todas</option>
            </select>
            {!sind.length && <span style={st.mut}>Cadastre um sindicato primeiro.</span>}
          </div>
          {listaP.length === 0 ? <p style={st.mut}>Nenhuma pesquisa.</p> : (
            <Tabela cab={["Quando", "Sindicato", "Tipos", "Repetição", "Situação", ""]} linhas={listaP.map((p) => {
              const s = porId.get(p.sindicato_id);
              const atrasada = p.status === "pendente" && (p.agendada_para ?? "") <= hoje();
              const [rot, cor] = STATUS[p.status] ?? [p.status, "inherit"];
              return [
                <span key="d" style={{ fontWeight: atrasada ? 700 : 400, color: atrasada ? "var(--div)" : undefined }}>{p.agendada_para ? dt(p.agendada_para) : "—"}{atrasada ? " · hoje" : ""}</span>,
                <span key="s">{s?.nome ?? "?"}{s?.cnpj ? <><br /><span style={st.mut}>{fmtDoc(s.cnpj)}</span></> : null}</span>,
                p.tipos.map((t) => NOME_TIPO[t] ?? t).join(", "),
                p.repetir_dias ? `a cada ${p.repetir_dias} dia(s) · ${p.tentativas} tentativa(s)` : "uma vez",
                <span key="st"><span style={{ color: cor, fontWeight: 600 }}>{rot}</span>{p.resultado ? <><br /><span style={st.mut}>{p.resultado}</span></> : null}{p.feita_por ? <><br /><span style={st.mut}>{p.feita_por} · {dt(p.feita_em)}</span></> : null}</span>,
                <span key="a" style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {s && <button style={{ ...st.btnP, padding: "4px 10px" }} onClick={() => abrirMediador(s, p.tipos, p.vigencia, p.uf)}>Abrir no Mediador</button>}
                  {p.status === "pendente" && <button style={{ ...st.btn, padding: "4px 10px" }} onClick={() => setResultado({ p, obs: "" })}>Registrar resultado</button>}
                  <button style={{ ...st.btn, padding: "4px 10px" }} onClick={() => setEditPesq(p)}>Editar</button>
                  <button style={{ ...st.btn, padding: "4px 10px" }} onClick={() => excluir("excluir_pesquisa", p.id, "Excluir esta pesquisa?")}>Excluir</button>
                </span>,
              ];
            })} />
          )}
          <p style={{ ...st.mut, marginTop: 10, fontSize: 12 }}>O robô abre o Mediador com a consulta preenchida (uma aba por tipo). A pesquisa em si é você quem clica — o Mediador tem verificação anti-robô (reCAPTCHA). O Chrome com o robô precisa estar no seu computador.</p>
        </div>
      )}

      {aba === "sindicatos" && (
        <div style={st.card}>
          <div style={{ ...st.bar, marginBottom: 10 }}>
            <button style={st.btnP} onClick={() => setEditSind({ ativo: true })}>Novo sindicato</button>
          </div>
          {listaS.length === 0 ? <p style={st.mut}>Nenhum sindicato cadastrado.</p> : (
            <Tabela cab={["Sindicato", "CNPJ", "UF", "Observação", ""]} linhas={listaS.map((s) => [
              <span key="n" style={{ opacity: s.ativo ? 1 : 0.5 }}>{s.nome}{!s.ativo ? " (inativo)" : ""}</span>,
              s.cnpj ? fmtDoc(s.cnpj) : "—", s.uf ?? "", s.observacao ?? "",
              <span key="a" style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button style={{ ...st.btnP, padding: "4px 10px" }} onClick={() => abrirMediador(s, ["convencao"], "1", s.uf)}>Pesquisar agora</button>
                <button style={{ ...st.btn, padding: "4px 10px" }} onClick={() => setEditPesq({ sindicato_id: s.id, tipos: ["convencao", "termoAditivoConvecao"], vigencia: "1", uf: s.uf, agendada_para: hoje(), repetir_dias: null })}>Programar</button>
                <button style={{ ...st.btn, padding: "4px 10px" }} onClick={() => setEditSind(s)}>Editar</button>
                <button style={{ ...st.btn, padding: "4px 10px" }} onClick={() => excluir("excluir_sindicato", s.id, `Excluir ${s.nome}? As pesquisas dele também são apagadas.`)}>Excluir</button>
              </span>,
            ])} />
          )}
        </div>
      )}

      {editSind && (
        <Modal titulo={editSind.id ? "Editar sindicato" : "Novo sindicato"} fechar={() => setEditSind(null)} largura={620}>
          <div style={linha("2fr 1fr")}>
            <Campo label="Nome do sindicato *"><input style={st.input} value={editSind.nome ?? ""} onChange={(e) => setEditSind({ ...editSind, nome: e.target.value })} /></Campo>
            <Campo label="CNPJ"><input style={st.input} value={editSind.cnpj ?? ""} placeholder="Somente números" onChange={(e) => setEditSind({ ...editSind, cnpj: e.target.value })} /></Campo>
          </div>
          <div style={linha("1fr 2fr")}>
            <Campo label="UF de registro"><select style={st.input} value={editSind.uf ?? ""} onChange={(e) => setEditSind({ ...editSind, uf: e.target.value })}><option value="">—</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Campo>
            <Campo label="Observação"><input style={st.input} value={editSind.observacao ?? ""} placeholder="Ex.: categoria, clientes que usam" onChange={(e) => setEditSind({ ...editSind, observacao: e.target.value })} /></Campo>
          </div>
          <label style={{ display: "flex", gap: 6, alignItems: "center", ...st.mut }}><input type="checkbox" checked={editSind.ativo ?? true} onChange={(e) => setEditSind({ ...editSind, ativo: e.target.checked })} /> Ativo</label>
          <Rodape><button style={st.btn} onClick={() => setEditSind(null)}>Cancelar</button><button style={st.btnP} onClick={salvarSind}>Salvar</button></Rodape>
        </Modal>
      )}

      {editPesq && (
        <Modal titulo={editPesq.id ? "Editar pesquisa" : "Nova pesquisa"} fechar={() => setEditPesq(null)} largura={640}>
          <div style={linha("1fr")}>
            <Campo label="Sindicato *">
              <select style={st.input} value={editPesq.sindicato_id ?? ""} onChange={(e) => { const s = porId.get(Number(e.target.value)); setEditPesq({ ...editPesq, sindicato_id: Number(e.target.value) || undefined, uf: editPesq.uf || s?.uf || "" }); }}>
                <option value="">Escolha…</option>
                {sind.filter((s) => s.ativo || s.id === editPesq.sindicato_id).map((s) => <option key={s.id} value={s.id}>{s.nome}{s.cnpj ? ` — ${fmtDoc(s.cnpj)}` : ""}</option>)}
              </select>
            </Campo>
          </div>
          <div style={{ marginBottom: 10 }}>
            <span style={{ ...st.mut, fontSize: 12 }}>Tipos de instrumento *</span>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 4 }}>
              {TIPOS.map(([k, t]) => (
                <label key={k} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={(editPesq.tipos ?? []).includes(k)} onChange={(e) => setEditPesq({ ...editPesq, tipos: e.target.checked ? [...(editPesq.tipos ?? []), k] : (editPesq.tipos ?? []).filter((x) => x !== k) })} /> {t}
                </label>
              ))}
            </div>
          </div>
          <div style={linha("1fr 1fr 1fr 1fr")}>
            <Campo label="Vigência"><select style={st.input} value={editPesq.vigencia ?? "1"} onChange={(e) => setEditPesq({ ...editPesq, vigencia: e.target.value })}>{VIGENCIA.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Campo>
            <Campo label="UF de registro"><select style={st.input} value={editPesq.uf ?? ""} onChange={(e) => setEditPesq({ ...editPesq, uf: e.target.value })}><option value="">Todas</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Campo>
            <Campo label="Pesquisar em"><input type="date" style={st.input} value={editPesq.agendada_para ?? hoje()} onChange={(e) => setEditPesq({ ...editPesq, agendada_para: e.target.value })} /></Campo>
            <Campo label="Repetir até achar"><select style={st.input} value={editPesq.repetir_dias ?? ""} onChange={(e) => setEditPesq({ ...editPesq, repetir_dias: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Não</option><option value="1">Todo dia</option><option value="3">A cada 3 dias</option><option value="7">Toda semana</option><option value="15">A cada 15 dias</option><option value="30">Todo mês</option>
            </select></Campo>
          </div>
          <p style={{ ...st.mut, fontSize: 12 }}>Com repetição, ao marcar "não encontrada" a pesquisa volta para a lista na próxima data, até alguém marcar "encontrada".</p>
          <Rodape><button style={st.btn} onClick={() => setEditPesq(null)}>Cancelar</button><button style={st.btnP} onClick={salvarPesq}>Salvar</button></Rodape>
        </Modal>
      )}

      {resultado && (
        <Modal titulo="Resultado da pesquisa" fechar={() => setResultado(null)} largura={560}>
          <p style={{ marginTop: 0 }}>{porId.get(resultado.p.sindicato_id)?.nome} — {resultado.p.tipos.map((t) => NOME_TIPO[t] ?? t).join(", ")}</p>
          <Campo label="Observação (nº de registro, vigência, onde salvou…)"><textarea style={{ ...st.input, minHeight: 60 }} value={resultado.obs} onChange={(e) => setResultado({ ...resultado, obs: e.target.value })} /></Campo>
          <Rodape>
            <button style={st.btn} onClick={() => marcar("cancelada")}>Cancelar pesquisa</button>
            <button style={st.btn} onClick={() => marcar("nao_encontrada")}>{resultado.p.repetir_dias ? `Não encontrada — tentar de novo em ${resultado.p.repetir_dias} dia(s)` : "Não encontrada"}</button>
            <button style={st.btnP} onClick={() => marcar("encontrada")}>Encontrada</button>
          </Rodape>
        </Modal>
      )}
    </div>
  );
}

const linha = (colunas: string): CSSProperties => ({ display: "grid", gridTemplateColumns: colunas, gap: 12, marginBottom: 10 });
function Rodape({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line, rgba(127,127,127,.25))" }}>{children}</div>;
}
