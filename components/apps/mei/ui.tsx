"use client";

// Peças comuns do Sistema MEI (estilos, tabela, campos, chamadas à API, CSV, impressão).
import { useEffect, useState } from "react";

export interface Mei {
  cod: number; codigocliente: number | null; razao: string; cnpj: string; salao: string; salaoCnpj: string; salaoCod: number | null;
  inicio: string | null; fim: string | null; ativo: boolean; bloqueado: boolean; mensal: number; clienteDesde: string | null; mensalNF: boolean;
  cidade: string; uf: string; email: string; cel: string; cpf: string; ie: string; im: string; cnae: string;
  endereco: string; compl: string; bairro: string; cep: string; mae: string; rg: string; nasc: string;
  titulo: string; whats: string; socio: string; apelido: string; ativMunic: string;
  servicos: { descricao?: string; valor?: number; competfinalvalid?: string | null }[];
}

export const AVULSO = 53278;
export const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dt = (s?: string | null) => (s ? String(s).slice(0, 10).split("-").reverse().join("/") : "");
export const hojeISO = () => new Date().toISOString().slice(0, 10);
export const situacao = (m: Mei) => (m.ativo ? "Ativo" : "Inativo");
export const primeiroDiaMes = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
export const ultimoDiaMes = () => { const d = new Date(); const u = new Date(d.getFullYear(), d.getMonth() + 1, 0); return `${u.getFullYear()}-${String(u.getMonth() + 1).padStart(2, "0")}-${String(u.getDate()).padStart(2, "0")}`; };
/** Texto sem HTML (as observações do Access são rich text). */
export const semHtml = (s?: string | null) => String(s ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();

export interface RespostaApi<T = unknown> { status: number; dados: T; dryRunForcado: boolean }

/** Chama a API Questor pelo proxy do Núcleo. Gravações vão em dry_run enquanto a trava estiver ligada. */
export async function api<T = unknown>(metodo: string, caminho: string, opts: { query?: Record<string, unknown>; corpo?: unknown; idempotencia?: string } = {}): Promise<RespostaApi<T>> {
  const r = await fetch("/api/mei/proxy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metodo, caminho, ...opts }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j as RespostaApi<T>;
}

/** Lê e já valida status 200. */
export async function ler<T = unknown>(caminho: string, query?: Record<string, unknown>): Promise<T> {
  const r = await api<T>("GET", caminho, { query });
  if (r.status !== 200) throw new Error(mensagemErro(r));
  return r.dados;
}

export function mensagemErro(r: RespostaApi): string {
  const d = r.dados as { detail?: unknown; erro?: string; error?: string } | null;
  const det = d?.detail;
  const txt = typeof det === "string" ? det : det ? JSON.stringify(det) : d?.erro || d?.error || "";
  if (r.status === 401 || r.status === 403) return `Sem permissão na API (${r.status})${txt ? ": " + txt : ""}`;
  return `Erro ${r.status}${txt ? ": " + txt : ""}`;
}

/** Resultado amigável de uma gravação (mostra quando foi só simulação). */
export function resumoGravacao(r: RespostaApi): { ok: boolean; texto: string } {
  if (r.status >= 200 && r.status < 300) {
    return { ok: true, texto: r.dryRunForcado ? "Validado em modo SIMULAÇÃO (dry_run): a API executou e desfez — nada foi gravado." : "Gravado." };
  }
  return { ok: false, texto: mensagemErro(r) };
}

export function baixarCsv(nome: string, cab: string[], linhas: (string | number | null | undefined)[][]) {
  const txt = [cab, ...linhas].map((l) => l.map((c) => String(c ?? "").replace(/[;\r\n]+/g, " ")).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + txt], { type: "text/csv;charset=utf-8" }));
  a.download = nome;
  a.click();
}

/** Abre uma janela de impressão com HTML simples (substitui os relatórios do Access). */
export function imprimir(titulo: string, html: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;font-size:12px;margin:24px;color:#111}
    h1{font-size:18px;margin:0 0 4px} h2{font-size:14px;margin:16px 0 6px;border-bottom:1px solid #999}
    table{width:100%;border-collapse:collapse} th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #ddd}
    th{background:#f2f2f2} .dir{text-align:right} .mut{color:#666;font-size:11px}
  </style></head><body><h1>${titulo}</h1><div class="mut">PHD Contábil · gerado em ${new Date().toLocaleString("pt-BR")}</div>${html}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export const st = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 16, marginBottom: 12 } as React.CSSProperties,
  bar: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 } as React.CSSProperties,
  input: { border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 13.5, background: "var(--surface)", color: "var(--text)" } as React.CSSProperties,
  btn: { border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "var(--surface)", color: "var(--text)", cursor: "pointer", textDecoration: "none", display: "inline-block" } as React.CSSProperties,
  btnP: { border: "1px solid var(--accent)", borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "var(--accent)", color: "#fff", cursor: "pointer", textDecoration: "none", display: "inline-block" } as React.CSSProperties,
  btnD: { border: "1px solid var(--div)", borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "var(--surface)", color: "var(--div)", cursor: "pointer" } as React.CSSProperties,
  lbl: { display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--muted)" } as React.CSSProperties,
  mut: { color: "var(--muted)", fontSize: 13 } as React.CSSProperties,
  aviso: { background: "var(--accent-soft)", borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 12 } as React.CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginBottom: 12 } as React.CSSProperties,
};

export function Tabela({ cab, linhas, total, onLinha }: { cab: string[]; linhas: React.ReactNode[][]; total?: number; onLinha?: (i: number) => void }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>{cab.map((c, i) => <th key={i} style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} onDoubleClick={onLinha ? () => onLinha(i) : undefined} style={{ background: i % 2 ? "var(--row-alt)" : undefined, cursor: onLinha ? "pointer" : undefined }}>
              {l.map((c, j) => <td key={j} style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!linhas.length && <p style={st.mut}>Nenhum registro.</p>}
      {total !== undefined && total > linhas.length && <p style={st.mut}>Mostrando {linhas.length} de {total}. Refine a pesquisa.</p>}
    </div>
  );
}

export function Campo({ label, children, largura }: { label: string; children: React.ReactNode; largura?: number }) {
  return <label style={{ ...st.lbl, minWidth: largura }}><span>{label}</span>{children}</label>;
}

export function Mensagem({ msg }: { msg: { ok: boolean; texto: string } | null }) {
  if (!msg) return null;
  return <div style={{ ...st.aviso, color: msg.ok ? "var(--ok)" : "var(--div)" }}>{msg.texto}</div>;
}

export function Modal({ titulo, fechar, children, largura = 640 }: { titulo: string; fechar: () => void; children: React.ReactNode; largura?: number }) {
  return (
    <div onClick={fechar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...st.card, width: "100%", maxWidth: largura, maxHeight: "90vh", overflow: "auto", marginBottom: 0 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, flex: 1 }}>{titulo}</h3>
          <button style={st.btn} onClick={fechar}>Fechar</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Carrega uma lista de apoio (responsáveis, serviços…) uma vez. */
export function useLista<T>(caminho: string, query?: Record<string, unknown>): { dados: T[]; erro: string; recarregar: () => void } {
  const [dados, setDados] = useState<T[]>([]);
  const [erro, setErro] = useState("");
  const [n, setN] = useState(0);
  const chave = JSON.stringify(query ?? {});
  useEffect(() => {
    ler<{ dados: T[] }>(caminho, JSON.parse(chave)).then((j) => setDados(j.dados ?? [])).catch((e) => setErro(e.message));
  }, [caminho, chave, n]);
  return { dados, erro, recarregar: () => setN((x) => x + 1) };
}

export interface Responsavel { id: number; nome: string; email: string | null; data_baixa: string | null; ativo: boolean }
export interface ServicoTarefa { id: number; descricao: string; dia_vencimento: number | null; dia_prazo_interno: number | null; competencia_tipo: number | null; gera_guia_auto: boolean; ativo: boolean }

/** Lista de salões (código + nome) a partir da carteira. */
export function saloesDe(mei: Mei[]): { cod: number; nome: string }[] {
  const m = new Map<number, string>();
  for (const x of mei) if (x.salaoCod) m.set(x.salaoCod, x.salaoCod === AVULSO ? "AVULSO" : x.salao || `Salão ${x.salaoCod}`);
  return [...m].map(([cod, nome]) => ({ cod, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
}

export function SelectSalao({ mei, valor, onChange, todos = true }: { mei: Mei[]; valor: string; onChange: (v: string) => void; todos?: boolean }) {
  const lista = saloesDe(mei);
  return (
    <Campo label="Salão">
      <select style={{ ...st.input, maxWidth: 320 }} value={valor} onChange={(e) => onChange(e.target.value)}>
        {todos && <option value="">Todos</option>}
        {lista.map((s) => <option key={s.cod} value={s.cod}>{s.nome}</option>)}
      </select>
    </Campo>
  );
}

// ---------------- Robô local (NFS-e e guia DAS) ----------------
export const ROBO_URL = "http://localhost:3199";
export const ROBO_VERSAO_MINIMA = 3;
export const ROBO_INSTALADOR = "/robo/instalar-robo-nucleo.bat";
export type RoboEstado = "ok" | "ausente" | "desatualizado";

/** Confere se o robô está rodando neste computador e se é a versão atual. */
export async function verificarRobo(): Promise<RoboEstado> {
  try {
    const r = await fetch(`${ROBO_URL}/status`, { cache: "no-store" });
    const j = await r.json();
    return Number(j.versao ?? 1) >= ROBO_VERSAO_MINIMA ? "ok" : "desatualizado";
  } catch { return "ausente"; }
}

/** Aviso com o link do instalador (baixa o .bat; ao abrir, ele instala/atualiza tudo sozinho). */
export function AvisoRobo({ estado, fechar }: { estado: RoboEstado; fechar?: () => void }) {
  if (estado === "ok") return null;
  return (
    <div style={{ ...st.aviso, borderLeft: "4px solid var(--accent)", display: "grid", gap: 6 }}>
      <b>{estado === "ausente" ? "O robô não está instalado (ou não está aberto) neste computador." : "Tem uma versão nova do robô."}</b>
      <span>1) Clique em <b>Baixar instalador</b> · 2) abra o arquivo baixado (se o Windows avisar, clique em “Mais informações” → “Executar assim mesmo”) · 3) espere a mensagem “Pronto!” e clique de novo no botão do robô.</span>
      <div style={{ display: "flex", gap: 8 }}>
        <a href={ROBO_INSTALADOR} download style={{ ...st.btnP, textDecoration: "none" }}>Baixar instalador</a>
        {fechar && <button style={st.btn} onClick={fechar}>Fechar</button>}
      </div>
      <span style={st.mut}>Não precisa de administrador. Precisa do Google Chrome instalado. Depois de instalado, o robô abre sozinho com o Windows.</span>
    </div>
  );
}

// ---------------- Erros do robô em linguagem simples ----------------
export interface ExplicacaoErro { titulo: string; oQueFazer: string; ehTI: boolean }

/** Traduz o erro técnico do robô para o pessoal do setor. ehTI = precisa chamar a T.I. */
export function explicarErroRobo(erro: string): ExplicacaoErro {
  const e = String(erro || "");
  const tem = (r: RegExp) => r.test(e);
  if (tem(/n[aã]o foi poss[ií]vel recuperar a lista de munic|indispon|503|502|504|ERR_CONNECTION|ERR_NAME|ERR_TIMED_OUT|net::|fora do ar|manuten/i))
    return { titulo: "O portal do governo está instável agora", oQueFazer: "Não é problema do sistema. Feche a janela do Chrome, espere alguns minutos e tente de novo.", ehTI: false };
  if (tem(/LOGIN_RECUSADO|senha.*(inv[aá]lid|incorret)|usu[aá]rio.*inv[aá]lid|bloquead/i))
    return { titulo: "O portal não aceitou o login (usuário ou senha)", oQueFazer: "Confira a senha da empresa em Controle e relatórios → Senhas (ou na Ficha → Senhas). Se a senha mudou no portal, atualize aqui e tente de novo.", ehTI: false };
  if (tem(/sem senha|n[aã]o tem a senha|Falta CNPJ, CPF ou c[oó]digo de acesso|c[oó]digo de acesso/i))
    return { titulo: "Falta a senha desta empresa no sistema", oQueFazer: "Cadastre a senha em Controle e relatórios → Senhas (Emissor Nacional, gov.br ou Simples Nacional) e tente de novo.", ehTI: false };
  if (tem(/j[aá] existe uma emiss[aã]o|rob[oô] em andamento/i))
    return { titulo: "O robô já está trabalhando em outra nota/guia", oQueFazer: "Termine a anterior (ou clique em Cancelar robô / feche a janela do Chrome) e tente de novo.", ehTI: false };
  if (tem(/Tempo esgotado esperando o login|waitForFunction|captcha/i))
    return { titulo: "O login não foi concluído a tempo", oQueFazer: "Se aparecer verificação (captcha ou código), resolva na janela do Chrome dentro de 5 minutos. Tente de novo.", ehTI: false };
  if (tem(/data futura|data inv[aá]lida|valor inv[aá]lido|tomador.*inv[aá]lido|MEI inv[aá]lido/i))
    return { titulo: "Algum dado da nota está errado", oQueFazer: "Confira data (não pode ser futura), valor e o CNPJ do salão (tomador) e tente de novo.", ehTI: false };
  if (tem(/Chrome n[aã]o encontrado|Executable doesn.t exist|chrome.*not found|Failed to launch/i))
    return { titulo: "O Google Chrome não foi encontrado neste computador", oQueFazer: "Instale o Google Chrome e rode o instalador do robô de novo.", ehTI: false };
  if (tem(/Cancelado|cancelad|fechad/i))
    return { titulo: "O robô foi cancelado ou a janela foi fechada", oQueFazer: "É só clicar de novo no botão do robô.", ehTI: false };
  return { titulo: "O robô não conseguiu terminar (mudança no portal ou erro do sistema)", oQueFazer: "Isso precisa da T.I. Clique em \"Abrir chamado na T.I.\" — o erro e o print vão junto.", ehTI: true };
}

/** Caixa de erro do robô: explicação simples + detalhe técnico + botão de chamado (quando é coisa da T.I.). */
export function ErroRobo({ erro, jobId, contexto, passos }: { erro: string; jobId?: string; contexto: string; passos?: { msg: string }[] }) {
  const x = explicarErroRobo(erro);
  const [chamado, setChamado] = useState<{ ok: boolean; texto: string; id?: string } | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  async function abrirChamado() {
    setAbrindo(true);
    try {
      let print: string | undefined;
      if (jobId) { const r = await fetch(`${ROBO_URL}/jobs/${jobId}/print`).catch(() => null); if (r?.ok) print = (await r.json()).jpeg; }
      const r = await fetch("/api/mei/robo/chamado", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contexto, erro, passos: (passos ?? []).map((p) => p.msg), print }) });
      const j = await r.json();
      setChamado(r.ok ? { ok: true, texto: "Chamado aberto para a T.I. (Pedro). Você pode acompanhar em Tecnologia → Tickets.", id: j.id } : { ok: false, texto: j.error ?? "Não consegui abrir o chamado." });
    } finally { setAbrindo(false); }
  }
  return (
    <div style={{ ...st.aviso, borderLeft: `4px solid ${x.ehTI ? "var(--div)" : "#d97706"}`, display: "grid", gap: 6 }}>
      <b>{x.titulo}</b>
      <span>{x.oQueFazer}</span>
      <details><summary style={{ cursor: "pointer", ...st.mut }}>Detalhe técnico</summary><code style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{erro}</code></details>
      {x.ehTI && !chamado?.ok && <div><button style={st.btnP} onClick={abrirChamado} disabled={abrindo}>{abrindo ? "Abrindo chamado…" : "Abrir chamado na T.I."}</button></div>}
      {chamado && <span style={{ color: chamado.ok ? "var(--ok)" : "var(--div)" }}>{chamado.texto}{chamado.id && <> · <a href={`/m/tecnologia/tickets?ticket=${chamado.id}`} target="_blank" rel="noreferrer">abrir o chamado</a></>}</span>}
    </div>
  );
}
