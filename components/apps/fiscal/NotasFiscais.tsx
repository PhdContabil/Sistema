"use client";

// Fiscal › Notas Fiscais: NFS-e de clientes do Simples Nacional (ME/EPP) pelo Portal
// Nacional, com o certificado da PHD e a procuração eletrônica do cliente.
// A tela inicial lista só as empresas CADASTRADAS para emissão (serviço, descrição
// padrão, tomadores e a empresa do grupo a que pertencem — ex.: profissionais de um
// salão). Em matriz, cada empresa do grupo abre com "+" e mostra os profissionais.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import catalogo from "@/lib/nfse/catalogo-nfse.json";
import { fmtCodEstab } from "@/lib/fiscal/estab";
import { st, Campo, Tabela, Modal, brl, dt, fmtDoc } from "../mei/ui";

interface Empresa {
  codigoempresa: number; nome: string; cnpj: string; im: string; municipio: string; uf: string; cep: string;
  regime: string; ativa: boolean; ativMunic: string; cTribNacSugerido: string;
  simples: { ok: boolean; aliquota: number | null; competencia: string | null; motivo?: string };
}
interface EmpresaLista { codigoempresa: number; nome: string; cnpj: string; regime: string; municipio: string; uf: string }
interface Tomador { id: number; codigoempresa: number; doc: string | null; nome: string | null; padrao: boolean; descricao?: string | null; info_compl?: string | null }
interface Grupo { id: number; nome: string }
interface Cad {
  codigoempresa: number; nome: string; cnpj: string; regime: string | null;
  grupo_codigo: number | null; grupo_nome: string | null; grupo_id?: number | null;
  c_trib_nac: string | null; c_trib_mun: string | null; c_nbs: string | null;
  descricao_padrao: string | null; info_compl_padrao: string | null; ativo: boolean;
  tomadores: Tomador[];
}
/** Descrição / inf. complementar: a do tomador escolhido, senão a padrão da empresa. */
const textosDe = (c: Cad | undefined, tom: Tomador | undefined) => ({
  descricao: tom?.descricao || c?.descricao_padrao || "", infoCompl: tom?.info_compl || c?.info_compl_padrao || "",
});
const ehMei = (r: string) => /MICRO\s*EMPREENDEDOR|\bMEI\b/i.test(r);

interface NotaEmitida {
  id: number; codigoempresa: number; cnpj: string; dcompet: string; valor: number; nnfse: string | null; chave_acesso: string | null;
  status: string; tomador_doc: string | null; tomador_nome: string | null; emitido_por: string | null; criado_em: string; ambiente: number;
  questor_ok: boolean | null; questor_erro: string | null; descricao?: string | null;
  cancelada_em?: string | null; cancelada_por?: string | null; cancel_motivo?: string | null;
}

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const novaIdem = (cod: number) => `fiscal-nfse-${cod}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const FORM_VAZIO = { data: hoje(), valor: "", descricao: "", infoCompl: "", cTribNac: "", cTribMun: "", cNBS: "", tomadorDoc: "", tomadorNome: "" };
type Modo = "tabela" | "matriz";

function useModo(chave: string): [Modo, (m: Modo) => void] {
  const [modo, setModo] = useState<Modo>("tabela");
  useEffect(() => { try { if (localStorage.getItem(chave) === "matriz") setModo("matriz"); } catch { /* sem storage */ } }, [chave]);
  return [modo, (m) => { setModo(m); try { localStorage.setItem(chave, m); } catch { /* sem storage */ } }];
}

/** Agrupa pela empresa do grupo (ex.: o salão). Quem não pertence a ninguém fica no próprio grupo. */
function agrupar<T>(itens: T[], chaveDe: (x: T) => number, nomeDe: (cod: number) => string) {
  const m = new Map<number, T[]>();
  for (const x of itens) { const k = chaveDe(x); m.set(k, [...(m.get(k) ?? []), x]); }
  return Array.from(m, ([cod, filhos]) => ({ cod, nome: nomeDe(cod), filhos })).sort((a, b) => a.nome.localeCompare(b.nome));
}

export default function NotasFiscais() {
  const [lista, setLista] = useState<EmpresaLista[] | null>(null);
  const [cads, setCads] = useState<Cad[] | null>(null);
  const [gruposCad, setGruposCad] = useState<Grupo[]>([]);
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useModo("nfse-fiscal-modo");
  const [modoNotas, setModoNotas] = useModo("nfse-fiscal-modo-notas");
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  const [aberta, setAberta] = useState(false);
  const [aba, setAba] = useState<"empresas" | "notas">("empresas");
  const [fn, setFn] = useState({ busca: "", competencia: "", campo: "competencia", de: "", ate: "", questor: "", status: "" });
  const [emp, setEmp] = useState<Empresa | null>(null);
  const [notas, setNotas] = useState<NotaEmitida[]>([]);
  const [ambiente, setAmbiente] = useState(1);
  const [info, setInfo] = useState("");
  const [f, setF] = useState(FORM_VAZIO);
  const [idem, setIdem] = useState("");
  const [erro, setErro] = useState("");
  const [emitindo, setEmitindo] = useState(false);
  const [emitida, setEmitida] = useState<{ id: number; chave: string; numero: string | null; ja?: boolean } | null>(null);
  const [lancando, setLancando] = useState<number | null>(null);
  const [msgLanc, setMsgLanc] = useState<Record<number, string>>({});
  const [editando, setEditando] = useState<Partial<Cad> | null>(null);
  const [cancelando, setCancelando] = useState<NotaEmitida | null>(null);

  const cadPorCod = useMemo(() => new Map((cads ?? []).map((c) => [c.codigoempresa, c])), [cads]);
  const nomePorCod = useMemo(() => {
    const m = new Map((lista ?? []).map((e) => [e.codigoempresa, e.nome]));
    for (const c of cads ?? []) { m.set(c.codigoempresa, c.nome); if (c.grupo_codigo && c.grupo_nome && !m.has(c.grupo_codigo)) m.set(c.grupo_codigo, c.grupo_nome); }
    return m;
  }, [lista, cads]);
  const grupoDe = (cod: number) => cadPorCod.get(cod)?.grupo_codigo ?? cod;

  async function carregar(cod?: number) {
    setInfo(cod ? "Buscando a empresa…" : "");
    try {
      const r = await fetch(`/api/fiscal/nfse${cod ? `?cod=${cod}` : ""}`);
      const j = await r.json();
      if (!r.ok) { setInfo(j.error ?? `Erro ${r.status}`); return; }
      setAmbiente(j.ambiente ?? 1);
      if (!cod) setNotas(j.notas ?? []);
      if (cod) {
        setEmp(j.empresa);
        const c = cadPorCod.get(cod);
        const tom = c?.tomadores.find((t) => t.padrao) ?? (c?.tomadores.length === 1 ? c.tomadores[0] : undefined);
        const nac = c?.c_trib_nac || j.empresa?.cTribNacSugerido || "";
        setF({
          ...FORM_VAZIO, data: hoje(), cTribNac: nac, cTribMun: c?.c_trib_mun ?? "", cNBS: c?.c_nbs || (SERV.get(nac)?.nbs[0] ?? ""),
          ...textosDe(c, tom),
          tomadorDoc: tom?.doc ?? "", tomadorNome: tom?.nome ?? "",
        });
        setIdem(novaIdem(cod)); setEmitida(null); setErro("");
        setInfo("");
      }
    } catch (e) { setInfo(e instanceof Error ? e.message : "Falha ao buscar."); }
  }
  async function carregarCadastro() {
    const j = await fetch("/api/fiscal/nfse/cadastro").then((r) => r.json()).catch(() => ({}));
    setCads(j.empresas ?? []);
    setGruposCad(j.grupos ?? []);
  }
  useEffect(() => {
    void carregar();
    void carregarCadastro();
    fetch("/api/fiscal/nfse/empresas").then((r) => r.json()).then((j) => setLista(j.empresas ?? [])).catch(() => setLista([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = semAcento(busca.trim()), dBusca = busca.replace(/\D/g, "");
  const cadsFiltrados = (cads ?? []).filter((c) => !t || String(c.codigoempresa) === dBusca || fmtCodEstab(c.codigoempresa) === busca.trim() || semAcento(c.nome).includes(t)
    || semAcento(c.grupo_nome ?? "").includes(t) || semAcento(gruposCad.find((g) => g.id === c.grupo_id)?.nome ?? "").includes(t) || (dBusca.length >= 3 && c.cnpj.includes(dBusca)));
  const grupos = useMemo(() => agrupar(cadsFiltrados, (c) => c.grupo_codigo ?? c.codigoempresa, (cod) => nomePorCod.get(cod) ?? `Empresa ${cod}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cads, busca, nomePorCod, gruposCad]);

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
      void carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao emitir."); }
    finally { setEmitindo(false); }
  }

  function novaNota() {
    if (!emp) return;
    const c = cadPorCod.get(emp.codigoempresa);
    const tom = c?.tomadores.find((x) => x.padrao);
    setEmitida(null); setErro(""); setIdem(novaIdem(emp.codigoempresa));
    setF((x) => ({ ...x, valor: "", tomadorDoc: tom?.doc ?? "", tomadorNome: tom?.nome ?? "", ...textosDe(c, tom) }));
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
  const notasFiltradas = notas.filter((n) => {
    const tt = semAcento(fn.busca.trim()), d = fn.busca.replace(/\D/g, "");
    if (tt && !(String(n.codigoempresa) === d || semAcento(nomePorCod.get(n.codigoempresa) ?? "").includes(tt) || semAcento(nomePorCod.get(grupoDe(n.codigoempresa)) ?? "").includes(tt)
      || semAcento(n.tomador_nome ?? "").includes(tt) || (d.length >= 3 && ((n.tomador_doc ?? "").includes(d) || (n.nnfse ?? "") === d)))) return false;
    if (fn.competencia && n.dcompet.slice(0, 7) !== fn.competencia) return false;
    const ref = fn.campo === "emissao" ? n.criado_em.slice(0, 10) : n.dcompet;
    if (fn.de && ref < fn.de) return false;
    if (fn.ate && ref > fn.ate) return false;
    if (fn.questor === "sim" && !n.questor_ok) return false;
    if (fn.questor === "nao" && n.questor_ok) return false;
    if (fn.status && n.status !== fn.status) return false;
    return true;
  });
  const totalNotas = notasFiltradas.filter((n) => n.status !== "cancelada").reduce((a, n) => a + Number(n.valor || 0), 0);
  const gruposNotas = useMemo(() => agrupar(notasFiltradas, (n) => grupoDe(n.codigoempresa), (cod) => nomePorCod.get(cod) ?? `Empresa ${cod}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notas, fn, cads, nomePorCod]);
  const limparFn = { busca: "", competencia: "", campo: "competencia", de: "", ate: "", questor: "", status: "" };
  const temFiltroNotas = JSON.stringify(fn) !== JSON.stringify(limparFn);
  const alternar = (cod: number) => setAbertos((s) => { const n = new Set(s); if (n.has(cod)) n.delete(cod); else n.add(cod); return n; });
  const propsNotas = { nomes: nomePorCod, lancar, lancando, msgLanc, cancelar: setCancelando };

  const linhaCad = (c: Cad, recuo = false): ReactNode[] => [
    <span key="c" style={recuo ? { paddingLeft: 22 } : undefined}>{fmtCodEstab(c.codigoempresa)}</span>,
    c.nome, fmtDoc(c.cnpj),
    [gruposCad.find((g) => g.id === c.grupo_id)?.nome, c.grupo_codigo ? `${fmtCodEstab(c.grupo_codigo)} - ${nomePorCod.get(c.grupo_codigo) ?? c.grupo_nome ?? ""}` : ""].filter(Boolean).join(" › ") || "—",
    c.c_trib_nac ? fmtServ(c.c_trib_nac) : <span key="s" style={{ color: "var(--div)" }}>sem serviço</span>,
    c.tomadores.length ? `${c.tomadores.length}${c.tomadores.some((x) => x.padrao) ? " (com padrão)" : ""}` : "—",
    <span key="a" style={{ display: "flex", gap: 6, whiteSpace: "nowrap" }}>
      <button style={{ ...st.btnP, padding: "4px 10px" }} onClick={() => abrirEmissao(c.codigoempresa)}>Emitir nota</button>
      <button style={{ ...st.btn, padding: "4px 10px" }} onClick={() => setEditando(c)}>Editar</button>
    </span>,
  ];

  return (
    <div>
      {ambiente === 2 && <div style={{ ...st.aviso, color: "var(--div)" }}>Ambiente de TESTE (produção restrita): as notas não valem.</div>}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {([["empresas", "Emitir nota"], ["notas", `Notas emitidas${notas.length ? ` (${notas.length})` : ""}`]] as const).map(([k, tx]) => (
          <button key={k} style={aba === k ? st.btnP : st.btn} onClick={() => setAba(k)}>{tx}</button>
        ))}
      </div>

      {aba === "notas" && (
        <div style={st.card}>
          <div style={st.bar}>
            <input style={{ ...st.input, maxWidth: 300 }} placeholder="Empresa, grupo, cód., tomador ou nº da nota" value={fn.busca} onChange={(e) => setFn({ ...fn, busca: e.target.value })} />
            <Campo label="Competência"><input type="month" style={{ ...st.input, maxWidth: 160 }} value={fn.competencia} onChange={(e) => setFn({ ...fn, competencia: e.target.value })} /></Campo>
            <Campo label="Período por">
              <select style={{ ...st.input, maxWidth: 170 }} value={fn.campo} onChange={(e) => setFn({ ...fn, campo: e.target.value })}>
                <option value="competencia">Data de competência</option>
                <option value="emissao">Data de emissão</option>
              </select>
            </Campo>
            <Campo label="De"><input type="date" style={{ ...st.input, maxWidth: 160 }} value={fn.de} onChange={(e) => setFn({ ...fn, de: e.target.value })} /></Campo>
            <Campo label="Até"><input type="date" style={{ ...st.input, maxWidth: 160 }} value={fn.ate} onChange={(e) => setFn({ ...fn, ate: e.target.value })} /></Campo>
            <select style={{ ...st.input, maxWidth: 170 }} value={fn.status} onChange={(e) => setFn({ ...fn, status: e.target.value })}>
              <option value="">Situação: todas</option>
              <option value="emitida">Emitidas</option>
              <option value="cancelada">Canceladas</option>
              <option value="incerta">Sem resposta</option>
            </select>
            <select style={{ ...st.input, maxWidth: 180 }} value={fn.questor} onChange={(e) => setFn({ ...fn, questor: e.target.value })}>
              <option value="">Questor: todas</option>
              <option value="nao">Falta lançar</option>
              <option value="sim">Já lançadas</option>
            </select>
            {temFiltroNotas && <button style={st.btn} onClick={() => setFn(limparFn)}>Limpar</button>}
            <ModoToggle modo={modoNotas} trocar={setModoNotas} />
          </div>
          <p style={{ ...st.mut, margin: "10px 0 6px" }}>{notasFiltradas.length} nota(s) · total {brl(totalNotas)} (sem as canceladas)</p>
          {notasFiltradas.length === 0 ? <p style={st.mut}>Nenhuma nota encontrada.</p>
            : modoNotas === "tabela" ? <TabelaNotas notas={notasFiltradas} {...propsNotas} />
            : (
              <div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <button style={st.btn} onClick={() => setAbertos(new Set(gruposNotas.map((g) => g.cod)))}>Expandir tudo</button>
                  <button style={st.btn} onClick={() => setAbertos(new Set())}>Recolher tudo</button>
                </div>
                {gruposNotas.map((g) => {
                  const total = g.filhos.filter((n) => n.status !== "cancelada").reduce((a, n) => a + Number(n.valor || 0), 0);
                  return (
                    <div key={g.cod} style={{ border: "1px solid var(--border)", borderRadius: 10, marginBottom: 8 }}>
                      <Cabecalho aberto={abertos.has(g.cod)} alternar={() => alternar(g.cod)} titulo={`${fmtCodEstab(g.cod)} - ${g.nome}`} resumo={`${g.filhos.length} nota(s) · ${brl(total)}`} />
                      {abertos.has(g.cod) && <div style={{ padding: "0 8px 8px" }}><TabelaNotas notas={g.filhos} {...propsNotas} /></div>}
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      )}

      {aba === "empresas" && <div style={st.card}>
        <div style={st.bar}>
          <input style={{ ...st.input, maxWidth: 340 }} placeholder="Buscar empresa, grupo, código ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button style={st.btnP} onClick={() => setEditando({})}>+ Cadastrar empresa</button>
          <ModoToggle modo={modo} trocar={setModo} />
          {info && !aberta && <span style={st.mut}>{info}</span>}
        </div>
        {cads === null ? <p style={st.mut}>Carregando empresas cadastradas…</p>
          : cads.length === 0 ? <p style={st.mut}>Nenhuma empresa cadastrada para emissão. Use “+ Cadastrar empresa”.</p>
          : modo === "tabela" ? (
            <>
              <p style={{ ...st.mut, margin: "10px 0 6px" }}>{cadsFiltrados.length} empresa(s)</p>
              <Tabela cab={["Cód.", "Empresa", "CNPJ", "Pertence a", "Serviço", "Tomadores", ""]} linhas={cadsFiltrados.map((c) => linhaCad(c))} />
            </>
          ) : (
            <>
              <div style={{ display: "flex", gap: 6, margin: "10px 0 8px", alignItems: "center" }}>
                <span style={st.mut}>{grupos.length} grupo(s) · {cadsFiltrados.length} empresa(s)</span>
                <button style={st.btn} onClick={() => setAbertos(new Set([...grupos.map((g) => g.cod), ...gruposCad.map((x) => -x.id)]))}>Expandir tudo</button>
                <button style={st.btn} onClick={() => setAbertos(new Set())}>Recolher tudo</button>
              </div>
              {(() => {
                // Nível 1: grupo com nome (ex.: Grupo OBDE). Nível 2: a empresa do grupo (ex.: o salão) com "+".
                // Nível 3: os profissionais que pertencem a ela. Sem grupo com nome: como antes.
                const cabecaGrupo = (g: typeof grupos[number]) => {
                  const dono = cadPorCod.get(g.cod);
                  const filhos = g.filhos.filter((c) => c.codigoempresa !== g.cod);
                  return (
                    <div key={g.cod} style={{ border: "1px solid var(--border)", borderRadius: 10, marginBottom: 8 }}>
                      <Cabecalho aberto={abertos.has(g.cod)} alternar={() => alternar(g.cod)} titulo={`${fmtCodEstab(g.cod)} - ${g.nome}`}
                        resumo={filhos.length ? `${filhos.length} profissional(is)` : "sem profissionais vinculados"}
                        acoes={dono ? <>
                          <button style={{ ...st.btnP, padding: "4px 10px" }} onClick={() => abrirEmissao(dono.codigoempresa)}>Emitir nota</button>
                          <button style={{ ...st.btn, padding: "4px 10px" }} onClick={() => setEditando(dono)}>Editar</button>
                        </> : <span style={st.mut}>não emite</span>} />
                      {abertos.has(g.cod) && filhos.length > 0 && (
                        <div style={{ padding: "0 8px 8px" }}>
                          <Tabela cab={["Cód.", "Profissional", "CNPJ", "Pertence a", "Serviço", "Tomadores", ""]} linhas={filhos.map((c) => linhaCad(c, true))} />
                        </div>
                      )}
                    </div>
                  );
                };
                const familiaDe = (g: typeof grupos[number]) => cadPorCod.get(g.cod)?.grupo_id ?? g.filhos.find((c) => c.grupo_id)?.grupo_id ?? null;
                const porFamilia = new Map<number, typeof grupos>();
                const soltos: typeof grupos = [];
                for (const g of grupos) { const fid = familiaDe(g); if (fid) porFamilia.set(fid, [...(porFamilia.get(fid) ?? []), g]); else soltos.push(g); }
                const familias = gruposCad.filter((x) => porFamilia.has(x.id));
                return <>
                  {familias.map((fam) => {
                    const membros = porFamilia.get(fam.id)!;
                    const comFilhos = membros.filter((g) => g.filhos.some((c) => c.codigoempresa !== g.cod));
                    const sozinhos = membros.filter((g) => !comFilhos.includes(g)).flatMap((g) => g.filhos);
                    const total = membros.reduce((n, g) => n + g.filhos.length, 0);
                    const k = -fam.id;
                    return (
                      <div key={`f${fam.id}`} style={{ border: "1px solid var(--accent)", borderRadius: 10, marginBottom: 10 }}>
                        <Cabecalho aberto={abertos.has(k)} alternar={() => alternar(k)} titulo={fam.nome}
                          resumo={`${comFilhos.length} empresa(s) com profissionais · ${total} cadastro(s)`} acoes={<span style={st.mut}>grupo</span>} />
                        {abertos.has(k) && (
                          <div style={{ padding: "0 8px 8px 22px" }}>
                            {comFilhos.map(cabecaGrupo)}
                            {sozinhos.length > 0 && <Tabela cab={["Cód.", "Empresa", "CNPJ", "Pertence a", "Serviço", "Tomadores", ""]} linhas={sozinhos.map((c) => linhaCad(c, true))} />}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {soltos.map(cabecaGrupo)}
                </>;
              })()}
            </>
          )}
      </div>}

      {editando && (
        <CadastroModal inicial={editando} lista={lista ?? []} grupos={gruposCad} fechar={() => setEditando(null)}
          salvo={(L, G) => { setCads(L); if (G) setGruposCad(G); }} />
      )}

      {cancelando && (
        <CancelarModal nota={cancelando} nome={nomePorCod.get(cancelando.codigoempresa) ?? ""} fechar={() => setCancelando(null)}
          feito={() => { setCancelando(null); void carregar(); }} />
      )}

      {aberta && (
        <Modal titulo={emp ? `Emitir NFS-e — ${fmtCodEstab(emp.codigoempresa)} - ${emp.nome}` : "Emitir NFS-e"} fechar={fecharEmissao} largura={820}>
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
                  <Campo label="Data de competência *"><input type="date" style={st.input} value={f.data} max={hoje()} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
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
                    <Busca valor={f.cNBS} rotulo={rotuloNbs} opcoes={(tx) => opcoesNbs(tx, f.cTribNac)}
                      escolher={(c) => setF((x) => ({ ...x, cNBS: c }))} placeholder="Digite o código ou o nome" />
                  </Campo>
                </div>
              </Secao>

              <Secao titulo="Tomador" dica="Em branco = nota sem tomador">
                {(cadPorCod.get(emp.codigoempresa)?.tomadores.length ?? 0) > 0 && (
                  <div style={linha("1fr")}>
                    <Campo label="Tomador do cadastro">
                      <select style={st.input} value={cadPorCod.get(emp.codigoempresa)!.tomadores.find((x) => (x.doc ?? "") === f.tomadorDoc.replace(/\D/g, "") && (x.nome ?? "") === f.tomadorNome)?.id ?? ""}
                        onChange={(e) => {
                          const x = cadPorCod.get(emp.codigoempresa)!.tomadores.find((y) => String(y.id) === e.target.value);
                          const c = cadPorCod.get(emp.codigoempresa);
                          setF({ ...f, tomadorDoc: x?.doc ?? "", tomadorNome: x?.nome ?? "", ...(x ? textosDe(c, x) : {}) });
                        }}>
                        <option value="">— digitar outro / sem tomador —</option>
                        {cadPorCod.get(emp.codigoempresa)!.tomadores.map((x) => (
                          <option key={x.id} value={x.id}>{x.nome || "(sem nome)"}{x.doc ? ` (${fmtDoc(x.doc)})` : x.nome ? "" : ""}{x.padrao ? " · padrão" : ""}{x.descricao ? " · descrição própria" : ""}</option>
                        ))}
                      </select>
                    </Campo>
                  </div>
                )}
                <div style={linha("1fr 2fr")}>
                  <Campo label="CPF ou CNPJ"><input style={st.input} value={f.tomadorDoc} placeholder="Somente números" onChange={(e) => setF({ ...f, tomadorDoc: e.target.value })} /></Campo>
                  <Campo label="Nome"><input style={st.input} value={f.tomadorNome} placeholder="Para CNPJ, vem da Receita" onChange={(e) => setF({ ...f, tomadorNome: e.target.value })} /></Campo>
                </div>
              </Secao>

              <Secao titulo="Descrição" dica={cadPorCod.get(emp.codigoempresa)?.descricao_padrao ? "Texto padrão do cadastro (pode ajustar)" : undefined}>
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
                  <p style={{ margin: "6px 0 0" }}><a href={`/api/fiscal/nfse/pdf?chave=${emitida.chave}`} target="_blank" rel="noreferrer">Abrir PDF da nota</a> · lance no Questor em Notas emitidas.</p>
                </div>
              )}
            </div>
          )}
          {emp && notas.some((n) => n.codigoempresa === emp.codigoempresa) && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Notas emitidas desta empresa</h3>
              <TabelaNotas notas={notas.filter((n) => n.codigoempresa === emp.codigoempresa).slice(0, 50)} {...propsNotas} />
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function ModoToggle({ modo, trocar }: { modo: Modo; trocar: (m: Modo) => void }) {
  return (
    <span style={{ display: "inline-flex", marginLeft: "auto", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      {(["tabela", "matriz"] as const).map((m) => (
        <button key={m} onClick={() => trocar(m)} style={{ border: 0, padding: "8px 12px", fontSize: 13, cursor: "pointer",
          background: modo === m ? "var(--accent)" : "var(--surface)", color: modo === m ? "#fff" : "var(--text)" }}>{m === "tabela" ? "Tabela" : "Matriz"}</button>
      ))}
    </span>
  );
}

function Cabecalho({ aberto, alternar, titulo, resumo, acoes }: { aberto: boolean; alternar: () => void; titulo: string; resumo: string; acoes?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px" }}>
      <button onClick={alternar} aria-label={aberto ? "Recolher" : "Expandir"}
        style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: "pointer", fontWeight: 700 }}>{aberto ? "−" : "+"}</button>
      <strong style={{ fontSize: 13.5, cursor: "pointer" }} onClick={alternar}>{titulo}</strong>
      <span style={st.mut}>{resumo}</span>
      {acoes && <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>{acoes}</span>}
    </div>
  );
}

function TabelaNotas({ notas, nomes, lancar, lancando, msgLanc, cancelar }: {
  notas: NotaEmitida[]; nomes: Map<number, string>; lancar: (n: NotaEmitida) => void; lancando: number | null; msgLanc: Record<number, string>; cancelar: (n: NotaEmitida) => void;
}) {
  return (
    <Tabela cab={["Empresa", "Competência", "Emissão", "Nº NFS-e", "Tomador", "Valor", "Emitida por", "PDF", "Questor", ""]} linhas={notas.map((n) => [
      `${fmtCodEstab(n.codigoempresa)}${nomes.get(n.codigoempresa) ? ` - ${nomes.get(n.codigoempresa)}` : ""}`, dt(n.dcompet), dt(n.criado_em),
      n.status === "incerta" ? "sem resposta — confira no portal" : (
        <span key="n">{n.nnfse ?? "—"}{n.status === "cancelada" && <><br /><span style={{ color: "var(--div)", fontSize: 12 }} title={n.cancel_motivo ?? ""}>CANCELADA em {dt(n.cancelada_em)}</span></>}</span>
      ),
      n.tomador_nome ? `${n.tomador_nome}${n.tomador_doc ? ` (${fmtDoc(n.tomador_doc)})` : ""}` : "Sem tomador",
      <span key="v" style={n.status === "cancelada" ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>{brl(Number(n.valor))}</span>, n.emitido_por ?? "",
      n.chave_acesso ? <a key="p" href={`/api/fiscal/nfse/pdf?chave=${n.chave_acesso}`} target="_blank" rel="noreferrer">PDF</a> : "",
      n.status !== "emitida" ? "" : n.questor_ok ? <span key="q" style={{ color: "var(--ok)" }}>lançada</span> : (
        <span key="q">
          <button style={{ ...st.btn, padding: "3px 8px" }} disabled={lancando === n.id} onClick={() => lancar(n)}>{lancando === n.id ? "Lançando…" : "Lançar no Questor"}</button>
          {(msgLanc[n.id] || n.questor_erro) && <><br /><span style={{ ...st.mut, color: "var(--div)" }}>{msgLanc[n.id] || n.questor_erro}</span></>}
        </span>
      ),
      n.status === "emitida" ? <button key="c" style={{ ...st.btnD, padding: "3px 8px" }} onClick={() => cancelar(n)}>Cancelar nota</button> : "",
    ])} />
  );
}

function CancelarModal({ nota, nome, fechar, feito }: { nota: NotaEmitida; nome: string; fechar: () => void; feito: () => void }) {
  const [motivo, setMotivo] = useState("1");
  const [just, setJust] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");
  async function enviar() {
    if (just.trim().length < 15) { setMsg("Escreva a justificativa (mínimo 15 caracteres)."); return; }
    if (!confirm(`Cancelar DEFINITIVAMENTE a NFS-e nº ${nota.nnfse} de ${nome}, valor ${brl(Number(nota.valor))}?\n\nO cancelamento vai para o Portal Nacional e não pode ser desfeito.`)) return;
    setEnviando(true); setMsg("");
    try {
      const r = await fetch("/api/fiscal/nfse/cancelar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: nota.id, motivo: Number(motivo), justificativa: just }) });
      const j = await r.json();
      if (j.ok) { alert(j.mensagem); feito(); } else setMsg(j.mensagem ?? j.error ?? `Erro ${r.status}`);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Falha."); }
    finally { setEnviando(false); }
  }
  return (
    <Modal titulo={`Cancelar NFS-e nº ${nota.nnfse ?? ""}`} fechar={fechar} largura={560}>
      <p style={{ ...st.mut, marginTop: 0 }}>{fmtCodEstab(nota.codigoempresa)} - {nome} · competência {dt(nota.dcompet)} · {brl(Number(nota.valor))}{nota.tomador_nome ? ` · ${nota.tomador_nome}` : ""}</p>
      {nota.questor_ok && <p style={{ ...st.aviso, color: "var(--div)" }}>Esta nota já foi lançada no Questor: depois de cancelar, ajuste o lançamento lá.</p>}
      <div style={linha("1fr")}>
        <Campo label="Motivo *">
          <select style={st.input} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            <option value="1">1 - Erro na emissão</option>
            <option value="2">2 - Serviço não prestado</option>
            <option value="9">9 - Outros</option>
          </select>
        </Campo>
      </div>
      <div style={linha("1fr")}>
        <Campo label="Justificativa * (mín. 15 caracteres)"><textarea style={{ ...st.input, minHeight: 70 }} value={just} maxLength={255} onChange={(e) => setJust(e.target.value)} /></Campo>
      </div>
      {msg && <p style={{ color: "var(--div)" }}>{msg}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button style={st.btn} onClick={fechar}>Voltar</button>
        <button style={{ ...st.btnD, background: "var(--div)", color: "#fff" }} disabled={enviando} onClick={enviar}>{enviando ? "Cancelando no Portal Nacional…" : "Cancelar NFS-e"}</button>
      </div>
    </Modal>
  );
}

/** Cadastro da empresa emissora: busca no cadastro de empresas, serviço, textos padrão, grupo e tomadores. */
function CadastroModal({ inicial, lista, grupos, fechar, salvo }: { inicial: Partial<Cad>; lista: EmpresaLista[]; grupos: Grupo[]; fechar: () => void; salvo: (L: Cad[], G?: Grupo[]) => void }) {
  const novo = !inicial.codigoempresa;
  const [c, setC] = useState<Partial<Cad>>(inicial);
  const TOM_VAZIO = { doc: "", nome: "", padrao: false, sem_tomador: false, descricao: "", info_compl: "" };
  const [tom, setTom] = useState(TOM_VAZIO);
  const [novoGrupo, setNovoGrupo] = useState<string | null>(null);
  const [textos, setTextos] = useState<{ id: number; descricao: string; info_compl: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [salvoUmaVez, setSalvoUmaVez] = useState(!novo);
  const porCod = useMemo(() => new Map(lista.map((e) => [e.codigoempresa, e])), [lista]);
  const rotuloEmp = (cod: string) => { const e = porCod.get(Number(cod)); return e ? `${fmtCodEstab(e.codigoempresa)} - ${e.nome} (${fmtDoc(e.cnpj)})` : cod; };
  const opcoesEmp = (tx: string) => {
    const d = tx.replace(/\D/g, ""), s = semAcento(tx.trim());
    // Código exato primeiro, depois código que começa com o digitado, depois nome/CNPJ (Enter pega o 1º).
    const cod = (e: EmpresaLista) => fmtCodEstab(e.codigoempresa);
    const peso = (e: EmpresaLista) => (d && cod(e).replace("-", "") === d ? 0 : d && cod(e).startsWith(d) ? 1 : 2);
    return lista.filter((e) => !s || cod(e).startsWith(d || "#") || cod(e) === tx.trim() || semAcento(e.nome).includes(s) || (d.length >= 3 && e.cnpj.includes(d)))
      .sort((a, b) => peso(a) - peso(b)).slice(0, 15).map((e) => String(e.codigoempresa));
  };

  async function enviar(corpo: Record<string, unknown>) {
    setOcupado(true); setMsg("");
    try {
      const r = await fetch("/api/fiscal/nfse/cadastro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const j = await r.json();
      if (!r.ok || !j.ok) { setMsg(j.error ?? `Erro ${r.status}`); return null; }
      salvo(j.empresas, j.grupos);
      if (j.grupo) setC((v) => ({ ...v, grupo_id: j.grupo.id }));
      return j.empresas as Cad[];
    } catch (e) { setMsg(e instanceof Error ? e.message : "Falha."); return null; }
    finally { setOcupado(false); }
  }
  const atualizarTomadores = (L: Cad[] | null) => { const x = L?.find((y) => y.codigoempresa === c.codigoempresa); if (x) setC((v) => ({ ...v, tomadores: x.tomadores })); };

  async function salvar() {
    if (!c.codigoempresa) { setMsg("Escolha a empresa no cadastro."); return; }
    const L = await enviar({ acao: "salvar", ...c });
    if (L) { setSalvoUmaVez(true); atualizarTomadores(L); setMsg("Salvo."); }
  }
  async function addTomador() {
    const L = await enviar({ acao: "tomador", codigoempresa: c.codigoempresa, ...tom });
    if (L) { atualizarTomadores(L); setTom(TOM_VAZIO); }
  }
  async function remover() {
    if (!confirm(`Remover ${c.nome} da lista de emissão? (As notas já emitidas continuam no histórico.)`)) return;
    if (await enviar({ acao: "remover", codigoempresa: c.codigoempresa })) fechar();
  }

  return (
    <Modal titulo={novo ? "Cadastrar empresa para emissão" : `Cadastro — ${fmtCodEstab(c.codigoempresa)} - ${c.nome}`} fechar={fechar} largura={820}>
      <Secao titulo="Empresa">
        <div style={linha("1fr")}>
          <Campo label="Empresa (cadastro de empresas) *">
            {novo ? (
              <Busca valor={c.codigoempresa ? String(c.codigoempresa) : ""} rotulo={rotuloEmp} opcoes={opcoesEmp} placeholder="Digite o código, nome ou CNPJ"
                escolher={(cod) => { const e = porCod.get(Number(cod))!; setC((v) => ({ ...v, codigoempresa: e.codigoempresa, nome: e.nome, cnpj: e.cnpj, regime: e.regime })); }} />
            ) : <input style={st.input} disabled value={`${fmtCodEstab(c.codigoempresa)} - ${c.nome} (${fmtDoc(c.cnpj ?? "")})`} />}
          </Campo>
        </div>
        {c.regime && !/MICROEMPRESA|PEQUENO PORTE/i.test(c.regime) && <p style={{ ...st.mut, color: "var(--div)", marginTop: 0 }}>Regime {c.regime}: {ehMei(c.regime) ? "MEI emite pelo Sistema MEI." : "por ora a emissão é só para o Simples Nacional."}</p>}
        <div style={linha("1fr")}>
          <Campo label="Grupo (ex.: Grupo OBDE — não precisa ser cliente)">
            {novoGrupo === null ? (
              <div style={{ display: "flex", gap: 6 }}>
                <select style={{ ...st.input, flex: 1 }} value={c.grupo_id ?? ""} onChange={(e) => setC((v) => ({ ...v, grupo_id: e.target.value ? Number(e.target.value) : null }))}>
                  <option value="">Nenhum</option>
                  {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
                </select>
                <button style={st.btn} onClick={() => setNovoGrupo("")}>+ Novo grupo</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <input style={{ ...st.input, flex: 1 }} autoFocus placeholder="Nome do grupo (ex.: Dao e Novadao)" value={novoGrupo} onChange={(e) => setNovoGrupo(e.target.value)} />
                <button style={st.btnP} disabled={ocupado || !novoGrupo.trim()} onClick={async () => { if (await enviar({ acao: "grupo_criar", nome: novoGrupo })) setNovoGrupo(null); }}>Criar</button>
                <button style={st.btn} onClick={() => setNovoGrupo(null)}>Cancelar</button>
              </div>
            )}
          </Campo>
        </div>
        <div style={linha("1fr")}>
          <Campo label="Pertence a (empresa do grupo, ex.: o salão — pode ser a própria empresa)">
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ flex: 1 }}>
                <Busca valor={c.grupo_codigo ? String(c.grupo_codigo) : ""} rotulo={(cod) => (porCod.has(Number(cod)) ? rotuloEmp(cod) : `${fmtCodEstab(Number(cod))} - ${c.grupo_nome ?? ""}`)} opcoes={opcoesEmp}
                  placeholder="Nenhuma — digite para vincular"
                  escolher={(cod) => { const e = porCod.get(Number(cod))!; setC((v) => ({ ...v, grupo_codigo: e.codigoempresa, grupo_nome: e.nome })); }} />
              </div>
              {c.grupo_codigo && <button style={st.btn} onClick={() => setC((v) => ({ ...v, grupo_codigo: null, grupo_nome: null }))}>Desvincular</button>}
            </div>
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Serviço padrão">
        <div style={linha("2fr 1fr")}>
          <Campo label="Código nacional">
            <Busca valor={c.c_trib_nac ?? ""} rotulo={rotuloServ} opcoes={opcoesServ} placeholder="Código ou nome do serviço"
              escolher={(cod) => setC((v) => ({ ...v, c_trib_nac: cod, c_nbs: SERV.get(cod)?.nbs.includes(v.c_nbs ?? "") ? v.c_nbs : (SERV.get(cod)?.nbs[0] ?? null) }))} />
          </Campo>
          <Campo label="Código municipal"><input style={st.input} maxLength={3} placeholder="Só se o município exigir" value={c.c_trib_mun ?? ""} onChange={(e) => setC({ ...c, c_trib_mun: e.target.value.replace(/\D/g, "") })} /></Campo>
        </div>
        <div style={linha("1fr")}>
          <Campo label="NBS">
            <Busca valor={c.c_nbs ?? ""} rotulo={rotuloNbs} opcoes={(tx) => opcoesNbs(tx, c.c_trib_nac ?? "")} placeholder="Código ou nome" escolher={(cod) => setC((v) => ({ ...v, c_nbs: cod }))} />
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Textos padrão" dica="Já vêm preenchidos ao emitir">
        <div style={linha("1fr")}>
          <Campo label="Descrição padrão do serviço"><textarea style={{ ...st.input, minHeight: 70, resize: "vertical" }} value={c.descricao_padrao ?? ""} onChange={(e) => setC({ ...c, descricao_padrao: e.target.value })} /></Campo>
        </div>
        <div style={linha("1fr")}>
          <Campo label="Informações complementares padrão"><textarea style={{ ...st.input, minHeight: 44, resize: "vertical" }} value={c.info_compl_padrao ?? ""} onChange={(e) => setC({ ...c, info_compl_padrao: e.target.value })} /></Campo>
        </div>
      </Secao>

      <Secao titulo="Tomadores" dica={salvoUmaVez ? "O padrão já vem selecionado ao emitir" : "Salve a empresa para cadastrar tomadores"}>
        {(c.tomadores ?? []).length > 0 && (
          <Tabela cab={["Tomador", "CPF/CNPJ", "Descrição", "Padrão", ""]} linhas={(c.tomadores ?? []).map((x) => [
            x.nome || "(nome pela Receita)", x.doc ? fmtDoc(x.doc) : "sem tomador",
            <span key="d" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ ...st.mut, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={x.descricao ?? ""}>{x.descricao ? x.descricao : "padrão da empresa"}</span>
              <button style={{ ...st.btn, padding: "3px 8px" }} disabled={ocupado} onClick={() => setTextos({ id: x.id, descricao: x.descricao ?? "", info_compl: x.info_compl ?? "" })}>Editar</button>
            </span>,
            x.padrao ? <strong key="p" style={{ color: "var(--ok)" }}>padrão</strong>
              : <button key="p" style={{ ...st.btn, padding: "3px 8px" }} disabled={ocupado} onClick={async () => atualizarTomadores(await enviar({ acao: "tomador_padrao", id: x.id }))}>Tornar padrão</button>,
            <button key="r" style={{ ...st.btnD, padding: "3px 8px" }} disabled={ocupado} onClick={async () => { if (confirm("Remover este tomador?")) atualizarTomadores(await enviar({ acao: "tomador_remover", id: x.id })); }}>Remover</button>,
          ])} />
        )}
        {salvoUmaVez && (
          <div style={{ marginTop: 8 }}>
            <div style={{ ...linha("1fr 2fr auto auto"), alignItems: "end" }}>
              <Campo label="CPF ou CNPJ"><input style={st.input} value={tom.doc} disabled={tom.sem_tomador} placeholder={tom.sem_tomador ? "sem tomador" : "Somente números"} onChange={(e) => setTom({ ...tom, doc: e.target.value })} /></Campo>
              <Campo label="Nome"><input style={st.input} value={tom.nome} placeholder={tom.sem_tomador ? "Sem tomador" : "Para CNPJ pode ficar em branco"} onChange={(e) => setTom({ ...tom, nome: e.target.value })} /></Campo>
              <label style={{ ...st.mut, display: "flex", gap: 4, alignItems: "center", paddingBottom: 8 }}><input type="checkbox" checked={tom.sem_tomador} onChange={(e) => setTom({ ...tom, sem_tomador: e.target.checked, doc: e.target.checked ? "" : tom.doc })} /> sem tomador</label>
              <label style={{ ...st.mut, display: "flex", gap: 4, alignItems: "center", paddingBottom: 8 }}><input type="checkbox" checked={tom.padrao} onChange={(e) => setTom({ ...tom, padrao: e.target.checked })} /> padrão</label>
            </div>
            <div style={linha("1fr")}>
              <Campo label="Descrição para este tomador (em branco = padrão da empresa)"><textarea style={{ ...st.input, minHeight: 50, resize: "vertical" }} value={tom.descricao} onChange={(e) => setTom({ ...tom, descricao: e.target.value })} /></Campo>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}><button style={st.btn} disabled={ocupado} onClick={addTomador}>Adicionar tomador</button></div>
          </div>
        )}
      </Secao>

      {textos && (
        <div style={{ ...st.card, marginTop: 8 }}>
          <b style={{ fontSize: 13 }}>Textos deste tomador</b>
          <div style={{ ...linha("1fr"), marginTop: 8 }}>
            <Campo label="Descrição (em branco = padrão da empresa)"><textarea style={{ ...st.input, minHeight: 60, resize: "vertical" }} value={textos.descricao} onChange={(e) => setTextos({ ...textos, descricao: e.target.value })} /></Campo>
          </div>
          <div style={linha("1fr")}>
            <Campo label="Informações complementares (em branco = padrão da empresa)"><textarea style={{ ...st.input, minHeight: 40, resize: "vertical" }} value={textos.info_compl} onChange={(e) => setTextos({ ...textos, info_compl: e.target.value })} /></Campo>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button style={st.btn} onClick={() => setTextos(null)}>Cancelar</button>
            <button style={st.btnP} disabled={ocupado} onClick={async () => { const L = await enviar({ acao: "tomador_textos", ...textos }); if (L) { atualizarTomadores(L); setTextos(null); } }}>Salvar textos</button>
          </div>
        </div>
      )}
      {msg && <p style={{ color: msg === "Salvo." ? "var(--ok)" : "var(--div)" }}>{msg}</p>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <span>{!novo && <button style={st.btnD} disabled={ocupado} onClick={remover}>Remover da lista</button>}</span>
        <span style={{ display: "flex", gap: 8 }}>
          <button style={st.btn} onClick={fechar}>Fechar</button>
          <button style={st.btnP} disabled={ocupado} onClick={salvar}>{ocupado ? "Salvando…" : "Salvar"}</button>
        </span>
      </div>
    </Modal>
  );
}

// ---------- Catálogo oficial: lista de serviços (LC 116) e NBS (Anexo VIII) ----------
interface Serv { c: string; d: string; nbs: string[] }
const CAT = catalogo as { servicos: Serv[]; nbs: Record<string, string> };
const SERV = new Map(CAT.servicos.map((x) => [x.c, x]));
const fmtServ = (c: string) => `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4, 6)}`;
const fmtNbs = (c: string) => `${c.slice(0, 1)}.${c.slice(1, 5)}.${c.slice(5, 7)}.${c.slice(7, 9)}`;
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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
    <div style={{ position: "relative", width: "100%" }}>
      <input style={{ ...st.input, width: "100%", boxSizing: "border-box" }} placeholder={placeholder} value={texto ?? (valor ? rotulo(valor) : "")}
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

