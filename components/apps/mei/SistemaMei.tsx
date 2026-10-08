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
import { SenhasLista } from "./Senhas";
import Notas from "./Notas";
import OSMei from "./OSMei";
import Contratos from "./Contratos";
import CadastroEmpresaTab from "@/components/apps/paralegal/CadastroEmpresaTab";
import AvulsoTab from "@/components/apps/paralegal/AvulsoTab";
import "@/components/apps/paralegal/controle.css";

const MENU: { grupo: string; itens: string[] }[] = [
  { grupo: "Painel", itens: ["Tarefas"] },
  { grupo: "Cadastros", itens: ["Cliente Mensal", "Cliente Avulso", "Usuários", "Serviços"] },
  { grupo: "Gestão de serviços", itens: ["Gerar O.S.", "Tabela de preço", "Contratos PHD", "Notas MEI"] },
  { grupo: "Controle e relatórios", itens: ["Ficha / Clientes", "Senhas Prefeitura", "Senhas Nacional", "Valores Mensal", "Dados MEI", "Salão x MEI", "Consulta financeiro", "Controle BI"] },
  { grupo: "Migração", itens: ["Situação"] },
];

interface Chaves { leitura: boolean; questor: boolean; mei: boolean; credenciais: boolean; gravacao: boolean }

export default function SistemaMei() {
  const [tela, setTela] = useState("Tarefas");
  const [mei, setMei] = useState<Mei[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [ficha, setFicha] = useState<Mei | null>(null);
  const [chaves, setChaves] = useState<Chaves | null>(null);

  const carregar = useCallback(async (forcar = false) => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/mei/empresas${forcar ? "?atualizar=1" : ""}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
      setMei(j.dados ?? []);
      setFicha((f) => (f ? (j.dados ?? []).find((x: Mei) => x.cod === f.cod) ?? f : f));
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar a carteira."); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); fetch("/api/mei/proxy").then((r) => r.json()).then(setChaves).catch(() => null); }, [carregar]);

  const ativos = mei.filter((m) => m.ativo).length;
  const abrir = (t: string) => { setTela(t); setFicha(null); };

  return (
    <div>
      {chaves && !chaves.gravacao && (
        <div style={{ ...st.aviso, borderLeft: "4px solid var(--accent)" }}>
          <b>Modo validação:</b> nenhuma tela grava de verdade. Toda gravação vai para a API com <code>dry_run</code> (ela executa e desfaz) ou é simulada. Para liberar, configurar <code>MEI_GRAVACAO_LIBERADA=sim</code> no Vercel.
        </div>
      )}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        {MENU.map((g) => (
          <div key={g.grupo}>
            <div style={{ fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>{g.grupo}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {g.itens.map((i) => <button key={i} style={i === tela ? st.btnP : st.btn} onClick={() => abrir(i)}>{i}</button>)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <span style={st.mut}>{carregando ? "Carregando carteira MEI…" : `${mei.length} MEI · ${ativos} ativos`}</span>
        <button style={st.btn} onClick={() => carregar(true)} disabled={carregando}>Atualizar dados</button>
      </div>
      {erro && <div style={{ ...st.aviso, color: "var(--div)" }}>{erro}</div>}

      {ficha ? <Ficha m={ficha} voltar={() => setFicha(null)} mudou={() => carregar(true)} /> : (
        <>
          {tela === "Tarefas" && <Tarefas mei={mei} />}
          {tela === "Cliente Mensal" && <div className="controle-app"><div style={st.aviso}>Cadastro de MEI novo no Questor (formCadastroQuestor): código na faixa 2001–3999, natureza 2135, enquadramento 4 (MEI), salão e senha do Portal Nacional. A consulta de CNPJ usa a BrasilAPI (o Access tentava antes o SERPRO/CCMEI com certificado digital — ainda não migrado).</div><CadastroEmpresaTab modo="mei" /></div>}
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
          {tela === "Consulta financeiro" && <ConsultaFinanceiro />}
          {tela === "Controle BI" && <div style={st.card}><p>O “Controle BI” do Access é o mesmo painel Power BI que já está no Núcleo.</p><Link href="/m/mei/painel" style={st.btnP}>Abrir Painel MEI</Link></div>}
          {tela === "Situação" && <Situacao chaves={chaves} />}
        </>
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
        ["Carteira MEI (enquad. 4, cód. < 4000)", "1.862", "1.861", "OK — falta só o cód. 2 (API exclui; pedido ao responsável)"],
        ["MEIs ativos (encerramento 31/12/2100)", "545", "545", "OK — corrigida a regra (antes 547 pela data de hoje)"],
        ["Salão do MEI", "1.862", "1.861 iguais", "OK"],
        ["Bloqueados (último segmento = 2)", "40", "40", "OK"],
        ["Mensalidade (72/102 vigentes)", "502 MEI", "501 MEI", "1 diferença: MEI 923 (código com 3 dígitos no texto) — pedido à API"],
        ["Tarefas", "18.822", "18.822", "OK"],
        ["Serviços de tarefa", "38", "38", "OK"],
        ["Responsáveis", "5", "6 (1 removido)", "OK"],
        ["Observações", "184", "182", "2 a menos — pedido à API"],
        ["Senhas (6 tabelas)", "4.319", "—", "Não conferido: falta a chave do perfil credenciais"],
        ["O.S. do MEI (mei.osfinanceiro)", "4.166", "—", "Sem rota na API (pedido /mei/os)"],
        ["Contratos / modelos", "7 / 5", "—", "Tabelas no Supabase prontas para criar (migration_mei_contratos.sql)"],
      ]} />
    </div>
  );
}
