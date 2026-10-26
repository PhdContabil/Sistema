"use client";

// Tela inicial do Sistema MEI: números do dia a dia e atalhos.
import { useEffect, useMemo, useState } from "react";
import { ler, st, brl, dt, hojeISO, primeiroDiaMes, ultimoDiaMes, type Mei } from "./ui";

interface TarefaP { id: number; codigoempresa: number; razao: string; servico_descricao: string; responsavel_nome: string; data_servico: string | null }
interface OSP { nos?: number; data: string | null; razao: string | null; tipo: string | null; valortt: number | null; questor?: string | number | null; datainicio?: string | null }

function Numero({ titulo, valor, detalhe, cor, onClick }: { titulo: string; valor: React.ReactNode; detalhe?: React.ReactNode; cor?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick}
      style={{ ...st.card, margin: 0, textAlign: "left", cursor: onClick ? "pointer" : "default", borderTop: `3px solid ${cor ?? "var(--accent)"}`, display: "grid", gap: 4, font: "inherit", color: "inherit" }}>
      <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{titulo}</span>
      <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{valor}</span>
      {detalhe && <span style={{ fontSize: 12, color: "var(--muted)" }}>{detalhe}</span>}
    </button>
  );
}

export default function Painel({ mei, ir, abrirFicha }: { mei: Mei[]; ir: (tela: string) => void; abrirFicha: (m: Mei) => void }) {
  const [abertas, setAbertas] = useState<TarefaP[] | null>(null);
  const [oss, setOss] = useState<OSP[] | null>(null);
  const [saidasNucleo, setSaidasNucleo] = useState<{ cod: number; lancada_em: string; data_encerramento: string }[]>([]);
  const hoje = hojeISO(); const ini = primeiroDiaMes(); const fim = ultimoDiaMes();

  useEffect(() => {
    ler<{ dados: TarefaP[] }>("/mei/tarefas", { status: "Em Aberto", de: "2000-01-01", ate: "2100-12-31", limit: 1000 }).then((j) => setAbertas(j.dados ?? [])).catch(() => setAbertas([]));
    ler<{ dados: OSP[] }>("/mei/os", { de: ini, ate: fim, limit: 500 }).then((j) => setOss(j.dados ?? [])).catch(() => setOss([]));
    fetch("/api/mei/saidas").then((r) => r.json()).then((j) => setSaidasNucleo(j.dados ?? [])).catch(() => null);
  }, [ini, fim]);

  const n = useMemo(() => {
    const ativos = mei.filter((m) => m.ativo);
    return {
      ativos: ativos.length,
      bloqueados: ativos.filter((m) => m.bloqueado).length,
      mensal: ativos.reduce((a, m) => a + (m.mensal || 0), 0),
    };
  }, [mei, ini, fim]);
  const vencidas = (abertas ?? []).filter((t) => (t.data_servico ?? "9999") < hoje);
  const totalOS = (oss ?? []).reduce((a, o) => a + (o.valortt || 0), 0);
  const porCod = useMemo(() => new Map(mei.map((m) => [m.cod, m])), [mei]);
  // Entradas = O.S. do tipo MEI emitidas no mês (é assim que o setor registra um profissional novo,
  // venha do Access ou do Núcleo). Soma também quem tem início de atividade no Questor dentro do mês.
  const novos = useMemo(() => {
    const vistos = new Map<string, { cod: string; razao: string; d: string | null; m?: Mei }>();
    for (const o of oss ?? []) {
      if (String(o.tipo ?? "").trim().toUpperCase() !== "MEI") continue;
      const cod = String(o.questor ?? "").trim();
      const chave = cod || `os${o.nos}`;
      if (vistos.has(chave)) continue;
      const m = cod ? porCod.get(Number(cod)) ?? porCod.get(cod as never) : undefined;
      vistos.set(chave, { cod, razao: m?.razao ?? String(o.razao ?? ""), d: o.datainicio || o.data, m });
    }
    for (const m of mei) {
      if ((m.inicio ?? "") >= ini && (m.inicio ?? "") <= fim && !vistos.has(String(m.cod)))
        vistos.set(String(m.cod), { cod: String(m.cod), razao: m.razao, d: m.inicio, m });
    }
    return [...vistos.values()];
  }, [oss, mei, porCod, ini, fim]);
  // Saídas: encerradas pelo Núcleo contam no mês em que o encerramento foi LANÇADO
  // (a data de encerramento costuma ser retroativa ou futura); as antigas (Access) pela data de encerramento.
  const saidas = useMemo(() => {
    const porLanc = new Map(saidasNucleo.map((s) => [s.cod, s]));
    const out: { m: Mei; d: string | null; enc: string | null }[] = [];
    for (const m of mei) {
      // Com baixa marcada (data diferente de 31/12/2100); o MEI segue "ativo" até a data.
      if (!m.fim || m.fim.slice(0, 10) >= "2100-12-31") continue;
      const s = porLanc.get(m.cod);
      if (s) {
        const lanc = s.lancada_em.slice(0, 10);
        if (lanc >= ini && lanc <= fim) out.push({ m, d: lanc, enc: m.fim ?? s.data_encerramento });
      } else if ((m.fim ?? "") >= ini && (m.fim ?? "") <= fim) out.push({ m, d: m.fim, enc: null });
    }
    return out;
  }, [mei, saidasNucleo, ini, fim]);
  const movimento = [
    ...novos.map((x) => ({ ...x, tipo: "Entrada" })),
    ...saidas.map(({ m, d, enc }) => ({ cod: String(m.cod), razao: m.razao, d, m, tipo: "Saída", enc })),
  ].sort((a, b) => String(b.d).localeCompare(String(a.d)));
  const mes = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        <Numero titulo="MEIs ativos" valor={n.ativos} detalhe={`${n.bloqueados} bloqueado(s)`} onClick={() => ir("Ficha / Clientes")} />
        <Numero titulo="Tarefas em aberto" valor={abertas === null ? "…" : abertas.length} detalhe="clique para abrir o painel" onClick={() => ir("Tarefas")} />
        <Numero titulo="Tarefas vencidas" valor={abertas === null ? "…" : vencidas.length} cor={vencidas.length ? "#dc2626" : "#16a34a"} detalhe={vencidas.length ? "precisam de atenção" : "tudo em dia"} onClick={() => ir("Tarefas")} />
        <Numero titulo={`O.S. de ${mes}`} valor={oss === null ? "…" : oss.length} detalhe={oss === null ? "" : brl(totalOS)} onClick={() => ir("Gerar O.S.")} />
        <Numero titulo="Entradas no mês" valor={oss === null ? "…" : novos.length} cor="#16a34a" detalhe="O.S. de MEI no mês" />
        <Numero titulo="Saídas no mês" valor={saidas.length} cor="#a16207" detalhe="encerramentos lançados no mês" />
        <Numero titulo="Mensalidades ativas" valor={brl(n.mensal)} detalhe="soma das mensalidades vigentes" onClick={() => ir("Valores Mensal")} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 12 }}>
        <div style={{ ...st.card, margin: 0 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Tarefas vencidas</h3>
          {abertas === null ? <p style={st.mut}>Carregando…</p> : vencidas.length === 0 ? <p style={st.mut}>Nenhuma tarefa vencida.</p> : (
            <div style={{ display: "grid" }}>
              {[...vencidas].sort((a, b) => String(a.data_servico).localeCompare(String(b.data_servico))).slice(0, 8).map((t) => (
                <button key={t.id} onClick={() => { const m = porCod.get(t.codigoempresa); if (m) abrirFicha(m); }}
                  style={{ display: "flex", gap: 10, justifyContent: "space-between", padding: "7px 0", border: "none", borderBottom: "1px solid var(--border)", background: "none", cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit", fontSize: 13 }}>
                  <span><b>{t.codigoempresa} - {t.razao}</b><br /><span style={st.mut}>{t.servico_descricao} · {t.responsavel_nome}</span></span>
                  <span style={{ color: "#b91c1c", whiteSpace: "nowrap" }}>{dt(t.data_servico)}</span>
                </button>
              ))}
              {vencidas.length > 8 && <button style={{ ...st.btn, marginTop: 8 }} onClick={() => ir("Tarefas")}>Ver as {vencidas.length}</button>}
            </div>
          )}
        </div>
        <div style={{ ...st.card, margin: 0 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Últimas O.S. do mês</h3>
          {oss === null ? <p style={st.mut}>Carregando…</p> : oss.length === 0 ? <p style={st.mut}>Nenhuma O.S. neste mês.</p> : (
            <div style={{ display: "grid" }}>
              {oss.slice(0, 8).map((o) => (
                <div key={o.nos} style={{ display: "flex", gap: 10, justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <span><b>nº {o.nos}</b> · {o.razao}<br /><span style={st.mut}>{o.tipo || "—"} · {dt(o.data)}</span></span>
                  <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{brl(o.valortt ?? 0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ ...st.card, margin: 0 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Movimento de clientes no mês</h3>
          {oss === null ? <p style={st.mut}>Carregando…</p> : movimento.length === 0 ? <p style={st.mut}>Sem entradas ou saídas neste mês.</p> : (
            <div style={{ display: "grid" }}>
              {movimento.slice(0, 12).map(({ cod, razao, m, tipo, d, ...x }) => (
                <button key={tipo + cod + razao} onClick={() => { if (m) abrirFicha(m); }} disabled={!m}
                  style={{ display: "flex", gap: 10, justifyContent: "space-between", padding: "7px 0", border: "none", borderBottom: "1px solid var(--border)", background: "none", cursor: m ? "pointer" : "default", textAlign: "left", font: "inherit", color: "inherit", fontSize: 13 }}>
                  <span>{cod ? `${cod} - ` : ""}{razao}</span>
                  <span style={{ color: tipo === "Entrada" ? "#15803d" : "#a16207", whiteSpace: "nowrap" }}>{tipo === "Saída" && "enc" in x && x.enc ? `Saída lançada ${dt(d)} · encerramento ${dt(x.enc as string)}` : `${tipo} · ${dt(d)}`}</span>
                </button>
              ))}
              {movimento.length > 12 && <span style={{ ...st.mut, paddingTop: 6 }}>+{movimento.length - 12} no mês</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
