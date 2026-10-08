"use client";

// Senhas (credenciais) — aba Senhas da ficha, "Senhas Prefeitura" (controle_senhas/editar_senha)
// e "Senhas Nacional" (controle_senhas_nacional/editar_senha_nacional).
// A API nunca lista a senha: ela só é revelada sob pedido (GET .../segredo, com registro em log).
import { useCallback, useEffect, useState } from "react";
import { api, st, Tabela, Campo, Mensagem, Modal, SelectSalao, baixarCsv, resumoGravacao, mensagemErro, type Mei } from "./ui";

export type TipoCred = "PREFEITURA" | "SIMPLES_NACIONAL" | "GOVBR" | "POSTO_FISCAL" | "REGULARIZE" | "EMISSOR_NACIONAL";
export const TIPOS: { tipo: TipoCred; nome: string; usuario: string; doc?: string; cod?: boolean }[] = [
  { tipo: "PREFEITURA", nome: "Prefeitura (NFS-e municipal)", usuario: "Usuário", doc: "CNPJ" },
  { tipo: "SIMPLES_NACIONAL", nome: "Simples Nacional (PGMEI)", usuario: "CNPJ", doc: "CPF", cod: true },
  { tipo: "GOVBR", nome: "gov.br", usuario: "CPF" },
  { tipo: "POSTO_FISCAL", nome: "Posto Fiscal", usuario: "Usuário" },
  { tipo: "REGULARIZE", nome: "Regularize (PGFN)", usuario: "Usuário" },
  { tipo: "EMISSOR_NACIONAL", nome: "Emissor Nacional NFS-e", usuario: "Usuário" },
];

export interface Credencial { id: number; codigoempresa: number | null; tipo: TipoCred; usuario: string | null; documento: string | null; cod_acesso: string | null; identificacao: number | null; ativo: boolean; tem_senha: boolean }

async function listar(query: Record<string, unknown>): Promise<Credencial[]> {
  const r = await api<{ dados: Credencial[] }>("GET", "/mei/credenciais", { query: { limit: 5000, ...query } });
  if (r.status !== 200) throw new Error(mensagemErro(r));
  return r.dados.dados ?? [];
}

function Revelar({ id }: { id: number }) {
  const [senha, setSenha] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  async function ver() {
    const r = await api<Record<string, unknown>>("GET", `/mei/credenciais/${id}/segredo`);
    if (r.status !== 200) { setErro(mensagemErro(r)); return; }
    const d = r.dados ?? {};
    setSenha(String(d.senha ?? d.segredo ?? JSON.stringify(d)));
  }
  if (erro) return <span style={{ color: "var(--div)", fontSize: 12 }}>{erro}</span>;
  return senha === null ? <button style={st.btn} onClick={ver} title="A visualização fica registrada no log">Ver senha</button> : <code>{senha}</code>;
}

function Editor({ cred, codigoempresa, tipoFixo, fechar, aoSalvar }: { cred: Partial<Credencial> | null; codigoempresa?: number; tipoFixo?: TipoCred; fechar: () => void; aoSalvar: () => void }) {
  const [d, setD] = useState({ tipo: (cred?.tipo ?? tipoFixo ?? "PREFEITURA") as TipoCred, codigoempresa: String(cred?.codigoempresa ?? codigoempresa ?? ""), usuario: cred?.usuario ?? "", documento: cred?.documento ?? "", cod_acesso: cred?.cod_acesso ?? "", senha: "" });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const t = TIPOS.find((x) => x.tipo === d.tipo)!;
  async function salvar() {
    const corpo: Record<string, unknown> = { usuario: d.usuario || null, documento: d.documento || null, cod_acesso: d.cod_acesso || null };
    if (d.senha) corpo.senha = d.senha;
    const r = cred?.id
      ? await api("PATCH", `/mei/credenciais/${cred.id}`, { corpo })
      : await api("POST", "/mei/credenciais", { corpo: { ...corpo, tipo: d.tipo, codigoempresa: d.codigoempresa ? +d.codigoempresa : null } });
    setMsg(resumoGravacao(r));
    if (r.status < 300 && !r.dryRunForcado) { aoSalvar(); fechar(); }
  }
  return (
    <Modal titulo={cred?.id ? `Editar senha — ${t.nome}` : `Nova senha — ${t.nome}`} fechar={fechar}>
      <div style={st.grid}>
        {!cred?.id && !tipoFixo && <Campo label="Tipo"><select style={st.input} value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value as TipoCred })}>{TIPOS.map((x) => <option key={x.tipo} value={x.tipo}>{x.nome}</option>)}</select></Campo>}
        <Campo label="Cód. empresa"><input style={st.input} value={d.codigoempresa} disabled={!!cred?.id || !!codigoempresa} onChange={(e) => setD({ ...d, codigoempresa: e.target.value.replace(/\D/g, "") })} /></Campo>
        <Campo label={t.usuario}><input style={st.input} value={d.usuario} onChange={(e) => setD({ ...d, usuario: e.target.value })} /></Campo>
        {t.doc && <Campo label={t.doc}><input style={st.input} value={d.documento} onChange={(e) => setD({ ...d, documento: e.target.value })} /></Campo>}
        {t.cod && <Campo label="Código de acesso"><input style={st.input} value={d.cod_acesso} onChange={(e) => setD({ ...d, cod_acesso: e.target.value })} /></Campo>}
        {!t.cod && <Campo label={cred?.id ? "Nova senha (vazio = manter)" : "Senha"}><input type="password" autoComplete="new-password" style={st.input} value={d.senha} onChange={(e) => setD({ ...d, senha: e.target.value })} /></Campo>}
      </div>
      <button style={st.btnP} onClick={salvar}>Salvar</button>
      <Mensagem msg={msg} />
    </Modal>
  );
}

/** Aba "Senhas" da ficha: as 6 senhas da empresa. */
export function SenhasEmpresa({ m }: { m: Mei }) {
  const [lista, setLista] = useState<Credencial[] | null>(null);
  const [erro, setErro] = useState("");
  const [ed, setEd] = useState<{ cred: Partial<Credencial> | null; tipo?: TipoCred } | null>(null);
  const carregar = useCallback(() => {
    setErro("");
    listar({ codigoempresa: m.cod }).then(setLista).catch((e) => { setErro(e.message); setLista([]); });
  }, [m.cod]);
  useEffect(() => { carregar(); }, [carregar]);
  return (
    <div style={st.card}>
      {erro && <div style={{ ...st.aviso, color: "var(--div)" }}>{erro}</div>}
      <Tabela cab={["Tipo", "Usuário / login", "Documento", "Cód. acesso", "Senha", ""]}
        linhas={TIPOS.map((t) => {
          const c = (lista ?? []).find((x) => x.tipo === t.tipo && x.ativo);
          return [t.nome, c?.usuario ?? "—", c?.documento ?? "", c?.cod_acesso ?? "", c?.tem_senha ? <Revelar key="r" id={c.id} /> : "—",
            <button key="e" style={st.btn} onClick={() => setEd({ cred: c ?? null, tipo: t.tipo })}>{c ? "Editar" : "Cadastrar"}</button>];
        })} />
      {ed && <Editor cred={ed.cred} codigoempresa={m.cod} tipoFixo={ed.tipo} fechar={() => setEd(null)} aoSalvar={carregar} />}
    </div>
  );
}

/** Telas "Senhas Prefeitura" e "Senhas Nacional". */
export function SenhasLista({ tipo, mei }: { tipo: "PREFEITURA" | "EMISSOR_NACIONAL"; mei: Mei[] }) {
  const [lista, setLista] = useState<Credencial[]>([]);
  const [erro, setErro] = useState("");
  const [q, setQ] = useState("");
  const [sit, setSit] = useState("Ativos");
  const [sal, setSal] = useState("");
  const [ed, setEd] = useState<Partial<Credencial> | null | undefined>(undefined);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const carregar = useCallback(() => { setErro(""); listar({ tipo, ativo: true }).then(setLista).catch((e) => setErro(e.message)); }, [tipo]);
  useEffect(() => { carregar(); }, [carregar]);

  const porCod = new Map(lista.map((c) => [c.codigoempresa, c]));
  // Igual ao Access: parte da lista de MEI (LEFT JOIN senhas), filtrando nome, situação e salão.
  const L = mei.filter((m) => m.razao.toLowerCase().includes(q.toLowerCase()) && (sit === "Todos" || (sit === "Ativos") === m.ativo) && (!sal || String(m.salaoCod) === sal))
    .sort((a, b) => a.razao.localeCompare(b.razao));

  async function excluir(c: Credencial) {
    if (!confirm("Excluir (inativar) esta senha?")) return;
    const r = await api("DELETE", `/mei/credenciais/${c.id}`);
    setMsg(resumoGravacao(r));
    if (r.status < 300 && !r.dryRunForcado) carregar();
  }

  return (
    <div style={st.card}>
      <div style={st.bar}>
        <Campo label="Pesquisar"><input style={st.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Razão social" /></Campo>
        <Campo label="Situação"><select style={st.input} value={sit} onChange={(e) => setSit(e.target.value)}>{["Ativos", "Inativos", "Todos"].map((x) => <option key={x}>{x}</option>)}</select></Campo>
        <SelectSalao mei={mei} valor={sal} onChange={setSal} />
        <button style={st.btn} onClick={() => baixarCsv(tipo === "PREFEITURA" ? "senhas_prefeitura.csv" : "senhas_nacional.csv", ["Cód.", "Razão", "CNPJ", "Usuário", "Tem senha", "Cidade"],
          L.map((m) => { const c = porCod.get(m.cod); return [m.cod, m.razao, c?.documento || m.cnpj, c?.usuario ?? "", c?.tem_senha ? "sim" : "", m.cidade]; }))}>Exportar CSV</button>
      </div>
      <div style={st.aviso}>A exportação não traz as senhas: pela regra nova da API, cada senha só aparece ao clicar em “Ver senha” e a visualização fica registrada.</div>
      {erro && <div style={{ ...st.aviso, color: "var(--div)" }}>{erro}</div>}
      <Mensagem msg={msg} />
      <Tabela total={L.length} cab={["Cód.", "Razão", "CNPJ", "Usuário", "Senha", "Cidade", ""]}
        linhas={L.slice(0, 300).map((m) => {
          const c = porCod.get(m.cod);
          return [m.cod, m.razao, c?.documento || m.cnpj, c?.usuario ?? "—", c?.tem_senha ? <Revelar key="r" id={c.id} /> : "—", m.cidade,
            <span key="b" style={{ display: "flex", gap: 6 }}>
              <button style={st.btn} onClick={() => setEd(c ?? { codigoempresa: m.cod, tipo })}>{c ? "Editar" : "Cadastrar"}</button>
              {c && <button style={st.btnD} onClick={() => excluir(c)}>Excluir</button>}
            </span>];
        })} />
      {ed !== undefined && <Editor cred={ed?.id ? ed : null} codigoempresa={ed?.codigoempresa ?? undefined} tipoFixo={tipo} fechar={() => setEd(undefined)} aoSalvar={carregar} />}
    </div>
  );
}
