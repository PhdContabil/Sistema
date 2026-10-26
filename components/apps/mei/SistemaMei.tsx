"use client";

// Sistema MEI — migração completa do MeiSistema.accdb (menu principal do Access).
// Gravações: todas passam pela trava MEI_GRAVACAO_LIBERADA (sem ela, a API só simula com dry_run).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { st, Tabela, Campo, type Mei } from "./ui";
import Tarefas from "./Tarefas";
import { Clientes, Ficha } from "./Clientes";
import { Responsaveis, Servicos, TabelaPreco } from "./Cadastros";
import { DadosMei, ValoresMensal, SalaoMei } from "./Relatorios";
import { RelatorioParceria } from "./Parceria";
import { SenhasLista } from "./Senhas";
import Notas, { EmitirNota } from "./Notas";
import Painel from "./Painel";
import OSMei from "./OSMei";
import Contratos from "./Contratos";
import CadastroEmpresaTab from "@/components/apps/paralegal/CadastroEmpresaTab";
import AvulsoTab from "@/components/apps/paralegal/AvulsoTab";
import "@/components/apps/paralegal/controle.css";

const MENU: { grupo: string; itens: string[] }[] = [
  { grupo: "Painel", itens: ["Início", "Tarefas"] },
  { grupo: "Cadastros", itens: ["Cliente Mensal", "Cliente Avulso", "Usuários", "Serviços"] },
  { grupo: "Gestão de serviços", itens: ["Gerar O.S.", "Tabela de preço", "Contratos PHD", "Notas MEI"] },
  { grupo: "Controle e relatórios", itens: ["Ficha / Clientes", "Senhas Prefeitura", "Senhas Nacional", "Valores Mensal", "Dados MEI", "Salão x MEI", "Parceria (Sindicato)", "Consulta financeiro", "Controle BI"] },
  { grupo: "Migração", itens: ["Situação"] },
];

// Cópia da carteira guardada no navegador: abrir/atualizar a página não chama a Vercel.
// A busca no servidor só acontece no botão "Atualizar dados", após uma alteração ou se não houver cópia.
const CHAVE_LOCAL = "nucleo-mei-carteira-v2";
function lerLocal(): { em: string; dados: Mei[] } | null {
  try { const t = localStorage.getItem(CHAVE_LOCAL); if (!t) return null; const j = JSON.parse(t); return Array.isArray(j?.dados) ? j : null; } catch { return null; }
}
function salvarLocal(dados: Mei[]) {
  const em = new Date().toISOString();
  try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify({ em, dados })); } catch { /* sem espaço ou bloqueado: segue só em memória */ }
  return em;
}

interface Chaves { leitura: boolean; questor: boolean; mei: boolean; credenciais: boolean; gravacao: boolean; liberados?: string[] }

export default function SistemaMei() {
  const [tela, setTela] = useState("Início");
  const [emitir, setEmitir] = useState<Mei | null>(null);
  const [grupo, setGrupo] = useState("");
  const [mei, setMei] = useState<Mei[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [ficha, setFicha] = useState<Mei | null>(null);
  const [chaves, setChaves] = useState<Chaves | null>(null);
  const [dadosDe, setDadosDe] = useState<string | null>(null);

  const carregar = useCallback(async (forcar = false) => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/mei/empresas${forcar ? "?atualizar=1" : ""}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
      setMei(j.dados ?? []);
      setDadosDe(salvarLocal(j.dados ?? []));
      setFicha((f) => (f ? (j.dados ?? []).find((x: Mei) => x.cod === f.cod) ?? f : f));
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar a carteira."); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => {
    const local = lerLocal();
    if (local && local.dados.length) { setMei(local.dados); setDadosDe(local.em); setCarregando(false); }
    else carregar();
    fetch("/api/mei/proxy").then((r) => r.json()).then(setChaves).catch(() => null); }, [carregar]);

  const ativos = mei.filter((m) => m.ativo).length;
  const abrir = (t: string) => { setTela(t); setFicha(null); };

  return (
    <div>
      {/* Menu em dois níveis: o grupo abre os sub-botões; o sub-botão abre a tela. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {MENU.map((g) => {
          const ativo = g.grupo === grupo;
          return (
            <button key={g.grupo} onClick={() => setGrupo(ativo ? "" : g.grupo)}
              style={{ ...(g.itens.includes(tela) ? st.btnP : st.btn), fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
              {g.grupo}<span style={{ fontSize: 10, opacity: 0.7 }}>{ativo ? "▲" : "▼"}</span>
            </button>
          );
        })}
      </div>
      {grupo && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, padding: "8px 10px", background: "var(--accent-soft)", borderRadius: 10 }}>
          {MENU.find((g) => g.grupo === grupo)?.itens.map((i) => (
            <button key={i} style={i === tela ? st.btnP : st.btn} onClick={() => { abrir(i); setGrupo(""); }}>{i}</button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <Busca mei={mei} abrir={(m) => { setFicha(m); setGrupo(""); }} />
        {!grupo && <span style={st.mut}>Tela: <b>{ficha ? "Ficha MEI" : tela}</b></span>}
        <span style={{ flex: 1 }} />
        <span style={st.mut}>{carregando ? "Carregando carteira MEI…" : `${mei.length} MEI · ${ativos} ativos${dadosDe ? ` · dados de ${new Date(dadosDe).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}`}</span>
        <button style={st.btn} onClick={() => carregar(true)} disabled={carregando}>Atualizar dados</button>
      </div>
      {erro && <div style={{ ...st.aviso, color: "var(--div)" }}>{erro}</div>}

      {ficha ? <Ficha m={ficha} voltar={() => setFicha(null)} mudou={() => carregar(true)} emitirNota={setEmitir} /> : (
        <>
          {tela === "Início" && <Painel mei={mei} ir={abrir} abrirFicha={setFicha} />}
          {tela === "Tarefas" && <Tarefas mei={mei} />}
          {tela === "Cliente Mensal" && <div className="controle-app"><CadastroEmpresaTab modo="mei" /></div>}
          {tela === "Cliente Avulso" && <div className="controle-app"><AvulsoTab modo="mei" /></div>}
          {tela === "Usuários" && <Responsaveis />}
          {tela === "Serviços" && <Servicos />}
          {tela === "Gerar O.S." && <OSMei mei={mei} />}
          {tela === "Tabela de preço" && <TabelaPreco />}
          {tela === "Contratos PHD" && <Contratos />}
          {tela === "Notas MEI" && <Notas mei={mei} />}
          {tela === "Ficha / Clientes" && <Clientes mei={mei} abrir={setFicha} />}
          {tela === "Senhas Prefeitura" && <SenhasLista tipo="PREFEITURA" mei={mei} />}
          {tela === "Senhas Nacional" && <SenhasLista tipo="EMISSOR_NACIONAL" mei={mei} />}
          {tela === "Valores Mensal" && <ValoresMensal mei={mei} />}
          {tela === "Dados MEI" && <DadosMei mei={mei} />}
          {tela === "Salão x MEI" && <SalaoMei mei={mei} />}
          {tela === "Parceria (Sindicato)" && <RelatorioParceria mei={mei} abrir={setFicha} />}
          {tela === "Consulta financeiro" && <ConsultaFinanceiro />}
          {tela === "Controle BI" && <div style={st.card}><p>O “Controle BI” do Access é o mesmo painel Power BI que já está no Núcleo.</p><Link href="/m/mei/painel" style={st.btnP}>Abrir Painel MEI</Link></div>}
          {tela === "Situação" && <Situacao chaves={chaves} />}
        </>
      )}
      {emitir && <EmitirNota m={emitir} data={new Date().toISOString().slice(0, 10)} fechar={() => setEmitir(null)} />}
    </div>
  );
}

/** Busca única: código, razão social, CNPJ ou CPF do titular — abre direto a ficha. */
function Busca({ mei, abrir }: { mei: Mei[]; abrir: (m: Mei) => void }) {
  const [q, setQ] = useState("");
  const [foco, setFoco] = useState(false);
  const [sel, setSel] = useState(0);
  const termo = q.trim().toLowerCase();
  const dig = termo.replace(/\D/g, "");
  const achados = termo.length < 2 ? [] : mei.filter((m) =>
    String(m.cod) === termo || m.razao.toLowerCase().includes(termo)
    || (dig.length >= 3 && (m.cnpj.replace(/\D/g, "").includes(dig) || String(m.cpf ?? "").replace(/\D/g, "").includes(dig))))
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.razao.localeCompare(b.razao)).slice(0, 8);
  const escolher = (m: Mei) => { abrir(m); setQ(""); setFoco(false); };
  return (
    <div style={{ position: "relative", flex: "1 1 320px", maxWidth: 520 }}>
      <input value={q} placeholder="Buscar MEI por nome, código, CNPJ ou CPF…" aria-label="Buscar MEI"
        onChange={(e) => { setQ(e.target.value); setSel(0); }} onFocus={() => setFoco(true)} onBlur={() => setTimeout(() => setFoco(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, achados.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          if (e.key === "Enter" && achados[sel]) escolher(achados[sel]);
          if (e.key === "Escape") setQ("");
        }}
        style={{ ...st.input, width: "100%", padding: "9px 12px 9px 34px", borderRadius: 10, fontSize: 14 }} />
      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.5, pointerEvents: "none" }}>⌕</span>
      {foco && termo.length >= 2 && (
        <div style={{ position: "absolute", zIndex: 30, top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--card, var(--bg))", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.12)", overflow: "hidden" }}>
          {achados.length === 0 ? <div style={{ ...st.mut, padding: 12 }}>Nenhum MEI encontrado.</div> : achados.map((m, i) => (
            <button key={m.cod} onMouseDown={() => escolher(m)} onMouseEnter={() => setSel(i)}
              style={{ display: "flex", width: "100%", gap: 10, alignItems: "center", padding: "9px 12px", border: "none", background: i === sel ? "var(--accent-soft)" : "transparent", cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit", fontSize: 13 }}>
              <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 42, color: "var(--muted)" }}>{m.cod}</span>
              <span style={{ flex: 1 }}><b>{m.razao}</b><br /><span style={st.mut}>{m.cnpj}{m.salao ? ` · ${m.salao}` : ""}</span></span>
              <span style={{ fontSize: 11, fontWeight: 600, color: m.ativo ? "#15803d" : "#b91c1c" }}>{m.ativo ? (m.bloqueado ? "Bloqueado" : "Ativo") : "Inativo"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ClienteFin { codigocliente: number; nome: string; inscrfederal?: string; tipo: string; codigoempresa?: number | null; nomemunic?: string; baixado: boolean }
function ConsultaFinanceiro() {
  const [q, setQ] = useState("");
  const [dados, setDados] = useState<ClienteFin[]>([]);
  const [msg, setMsg] = useState("Digite ao menos 3 letras do nome, CPF/CNPJ ou código.");
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) { setDados([]); return; }
      setMsg("Pesquisando…");
      try {
        const r = await fetch(`/api/mei/avulsos?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setDados(j.dados ?? []); setMsg("");
      } catch (e) { setMsg(e instanceof Error ? e.message : "Falha na pesquisa."); }
    }, 400);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div style={st.card}>
      <div style={st.bar}><Campo label="Pesquisar no financeiro"><input style={{ ...st.input, minWidth: 320 }} value={q} onChange={(e) => setQ(e.target.value)} /></Campo></div>
      {msg ? <p style={st.mut}>{msg}</p> : <Tabela cab={["Cód. fin.", "Nome", "CPF/CNPJ", "Tipo", "Cód. empresa", "Cidade", "Situação"]} linhas={dados.slice(0, 200).map((x) => [x.codigocliente, x.nome, x.inscrfederal ?? "", x.tipo, x.codigoempresa ?? "—", x.nomemunic ?? "", x.baixado ? "Baixado" : "Ativo"])} />}
    </div>
  );
}

function Situacao({ chaves }: { chaves: Chaves | null }) {
  const sim = (b?: boolean) => (b ? "configurada" : "FALTA");
  return (
    <div style={st.card}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>Chaves e trava</h3>
      <Tabela cab={["Item", "Situação", "Para quê"]} linhas={[
        ["Leitura (QUESTOR_API_KEY)", sim(chaves?.leitura), "Todas as consultas"],
        ["Escrita Questor (QUESTOR_WRITE_KEY)", sim(chaves?.questor), "Cadastro MEI/avulso, encerrar/reativar, cobrança da O.S."],
        ["Perfil MEI operador (MEI_API_KEY)", sim(chaves?.mei), "Tarefas, serviços, responsáveis, observações"],
        ["Perfil MEI credenciais (MEI_CRED_KEY)", sim(chaves?.credenciais), "Senhas (listar, ver, editar)"],
        ["Trava (MEI_GRAVACAO_LIBERADA)", chaves?.gravacao ? "LIBERADA (grava de verdade)" : "ligada — só simula", "Proteção durante a validação"],
      ]} />
      <h3 style={{ fontSize: 15 }}>Conferência dos dados (08/10/2026, Access × Núcleo)</h3>
      <Tabela cab={["Item", "Access", "Núcleo/API", "Resultado"]} linhas={[
        ["Carteira MEI (enquad. 4, cód. < 4000)", "1.862", "1.861", "Cód. 2 em análise (Questor diz enquad. 3)"],
        ["MEIs ativos (encerramento 31/12/2100)", "546", "546", "OK — regra do Access (pela data de hoje seriam 547)"],
        ["Salão do MEI", "1.862", "1.861 iguais", "OK"],
        ["Bloqueados (último segmento = 2)", "40", "40", "OK"],
        ["Mensalidade (72/102 vigentes)", "502 MEI", "502 MEI", "OK — API corrigida (MEI 923)"],
        ["Tarefas", "18.822", "18.822", "OK"],
        ["Serviços de tarefa", "38", "38", "OK"],
        ["Responsáveis", "5", "6 (1 removido)", "OK"],
        ["Observações", "184", "182", "2 a menos — pedido à API"],
        ["Senhas (6 tabelas)", "4.319", "4.316", "Prefeitura, gov.br, Posto, Regularize e Nacional iguais; Simples Nacional 798 × 795"],
        ["O.S. do MEI (mei.osfinanceiro)", "4.166", "—", "Sem rota na API (pedido /mei/os)"],
        ["Contratos / modelos", "7 / 5", "—", "Tabelas no Supabase prontas para criar (migration_mei_contratos.sql)"],
      ]} />
    </div>
  );
}
