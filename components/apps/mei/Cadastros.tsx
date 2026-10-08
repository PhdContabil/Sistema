"use client";

// Cadastros auxiliares: Usuários/Responsáveis (formresponsavel), Serviços de tarefa (formservico)
// e Tabela de preço (formcon_servicos: SERVICOESCRIT 2000–2100, só leitura).
import { useEffect, useState } from "react";
import { api, ler, st, Tabela, Campo, Mensagem, Modal, useLista, brl, dt, hojeISO, resumoGravacao, type Responsavel, type ServicoTarefa } from "./ui";

export function Responsaveis() {
  const { dados, erro, recarregar } = useLista<Responsavel>("/mei/responsaveis");
  const [ed, setEd] = useState<Partial<Responsavel> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  async function salvar() {
    if (!ed?.nome?.trim()) { setMsg({ ok: false, texto: "Informe o nome." }); return; }
    const r = ed.id
      ? await api("PATCH", `/mei/responsaveis/${ed.id}`, { corpo: { nome: ed.nome.trim(), email: ed.email || null } })
      : await api("POST", "/mei/responsaveis", { corpo: { nome: ed.nome.trim(), email: ed.email || null } });
    setMsg(resumoGravacao(r));
    if (r.status < 300 && !r.dryRunForcado) { setEd(null); recarregar(); }
  }
  async function baixar(x: Responsavel, reativar: boolean) {
    if (!confirm(reativar ? `Reativar ${x.nome}?` : `Dar baixa em ${x.nome}? (some dos combos de novas tarefas)`)) return;
    const r = await api("PATCH", `/mei/responsaveis/${x.id}`, { corpo: reativar ? { reativar: true } : { data_baixa: hojeISO() } });
    setMsg(resumoGravacao(r));
    if (r.status < 300 && !r.dryRunForcado) recarregar();
  }

  return (
    <div style={st.card}>
      <div style={st.bar}><button style={st.btnP} onClick={() => { setEd({ nome: "", email: "" }); setMsg(null); }}>Novo responsável</button></div>
      <Mensagem msg={msg} />
      {erro && <p style={{ color: "var(--div)" }}>{erro}</p>}
      <Tabela cab={["Código", "Nome", "E-mail", "Data de baixa", "Situação", ""]}
        linhas={dados.map((x) => [x.id, x.nome, x.email ?? "", dt(x.data_baixa), x.ativo ? "Ativo" : "Baixado",
          <span key="a" style={{ display: "flex", gap: 6 }}>
            <button style={st.btn} onClick={() => { setEd(x); setMsg(null); }}>Editar</button>
            {x.ativo ? <button style={st.btnD} onClick={() => baixar(x, false)}>Baixar</button> : <button style={st.btn} onClick={() => baixar(x, true)}>Reativar</button>}
          </span>])} />
      {ed && (
        <Modal titulo={ed.id ? `Responsável ${ed.id}` : "Novo responsável"} fechar={() => setEd(null)}>
          <div style={st.grid}>
            <Campo label="Nome"><input style={st.input} value={ed.nome ?? ""} onChange={(e) => setEd({ ...ed, nome: e.target.value })} /></Campo>
            <Campo label="E-mail"><input style={st.input} value={ed.email ?? ""} onChange={(e) => setEd({ ...ed, email: e.target.value })} /></Campo>
          </div>
          <button style={st.btnP} onClick={salvar}>Salvar</button>
          <Mensagem msg={msg} />
        </Modal>
      )}
    </div>
  );
}

const COMPETENCIA = ["Mês atual", "Mês anterior", "Ano anterior"];

export function Servicos() {
  const { dados, erro, recarregar } = useLista<ServicoTarefa>("/mei/servicos");
  const [ed, setEd] = useState<Partial<ServicoTarefa> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const num = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));

  async function salvar() {
    if (!ed?.descricao?.trim()) { setMsg({ ok: false, texto: "Informe a descrição." }); return; }
    const corpo = { competencia_tipo: Number(ed.competencia_tipo ?? 0), descricao: ed.descricao.trim(), dia_vencimento: num(ed.dia_vencimento), dia_prazo_interno: num(ed.dia_prazo_interno), gera_guia_auto: !!ed.gera_guia_auto, ...(ed.id ? { ativo: ed.ativo !== false } : {}) };
    const r = ed.id ? await api("PATCH", `/mei/servicos/${ed.id}`, { corpo }) : await api("POST", "/mei/servicos", { corpo });
    setMsg(resumoGravacao(r));
    if (r.status < 300 && !r.dryRunForcado) { setEd(null); recarregar(); }
  }

  return (
    <div style={st.card}>
      <div style={st.aviso}>Serviços de tarefa (tabela “servico” do Access). O serviço 6 é a emissão da guia DAS. A “competência” define se a tarefa é do mês atual, do anterior ou do ano anterior.</div>
      <div style={st.bar}><button style={st.btnP} onClick={() => { setEd({ descricao: "", ativo: true }); setMsg(null); }}>Novo serviço</button></div>
      <Mensagem msg={msg} />
      {erro && <p style={{ color: "var(--div)" }}>{erro}</p>}
      <Tabela cab={["Código", "Descrição", "Dia de vencimento", "Prazo interno (dia)", "Competência", "Guia automática", "Situação", ""]}
        linhas={[...dados].sort((a, b) => a.descricao.localeCompare(b.descricao)).map((x) => [x.id, x.descricao, x.dia_vencimento ?? "", x.dia_prazo_interno ?? "",
          COMPETENCIA[Math.abs(x.competencia_tipo ?? 0)] ?? "", x.gera_guia_auto ? "Sim" : "", x.ativo ? "Ativo" : "Inativo",
          <button key="e" style={st.btn} onClick={() => { setEd(x); setMsg(null); }}>Editar</button>])} />
      {ed && (
        <Modal titulo={ed.id ? `Serviço ${ed.id}` : "Novo serviço"} fechar={() => setEd(null)}>
          <div style={st.grid}>
            <Campo label="Descrição"><input style={st.input} value={ed.descricao ?? ""} onChange={(e) => setEd({ ...ed, descricao: e.target.value })} /></Campo>
            <Campo label="Dia de vencimento"><input style={st.input} value={ed.dia_vencimento ?? ""} onChange={(e) => setEd({ ...ed, dia_vencimento: e.target.value.replace(/\D/g, "") as unknown as number })} /></Campo>
            <Campo label="Prazo interno (dia de entrega)"><input style={st.input} value={ed.dia_prazo_interno ?? ""} onChange={(e) => setEd({ ...ed, dia_prazo_interno: e.target.value.replace(/\D/g, "") as unknown as number })} /></Campo>
            <Campo label="Competência"><select style={st.input} value={String(ed.competencia_tipo ?? 0)} onChange={(e) => setEd({ ...ed, competencia_tipo: Number(e.target.value) })}><option value="0">Mês atual</option><option value="-1">Mês anterior</option><option value="-2">Ano anterior</option></select></Campo>
          </div>
          <label style={{ fontSize: 13, display: "block", marginBottom: 6 }}><input type="checkbox" checked={!!ed.gera_guia_auto} onChange={(e) => setEd({ ...ed, gera_guia_auto: e.target.checked })} /> Gera guia automática</label>
          {ed.id && <label style={{ fontSize: 13, display: "block", marginBottom: 10 }}><input type="checkbox" checked={ed.ativo !== false} onChange={(e) => setEd({ ...ed, ativo: e.target.checked })} /> Ativo</label>}
          <button style={st.btnP} onClick={salvar}>Salvar</button>
          <Mensagem msg={msg} />
        </Modal>
      )}
    </div>
  );
}

interface ServicoEscrit { codigo: number; descricao: string; valor: number | null; tipo?: string | null; conta?: number | null }

export function TabelaPreco() {
  const [dados, setDados] = useState<ServicoEscrit[]>([]);
  const [q, setQ] = useState("");
  const [erro, setErro] = useState("");
  useEffect(() => {
    ler<{ dados: ServicoEscrit[] } | ServicoEscrit[]>("/lookups/servicos", { codigo_min: 2000, codigo_max: 2100, limit: 500 })
      .then((j) => setDados(Array.isArray(j) ? j : j.dados ?? [])).catch((e) => setErro(e.message));
  }, []);
  const L = dados.filter((s) => (s.codigo + " " + s.descricao).toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={st.card}>
      <div style={st.aviso}>Serviços do escritório no Questor (SERVICOESCRIT, códigos 2000 a 2100), como na tela “Tabela de preço” do Access.</div>
      <div style={st.bar}><Campo label="Pesquisar"><input style={st.input} value={q} onChange={(e) => setQ(e.target.value)} /></Campo></div>
      {erro && <p style={{ color: "var(--div)" }}>{erro}</p>}
      <Tabela cab={["Código", "Descrição", "Valor"]} linhas={L.map((s) => [s.codigo, s.descricao, s.valor != null ? brl(s.valor) : "—"])} />
    </div>
  );
}
