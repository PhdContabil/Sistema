"use client";

// Formulário "Incluir tarefa" (DP → Tareffa) dentro do ticket do Trabalhista. PILOTO.
import { useEffect, useMemo, useState } from "react";

const INPUT = "bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100";
const BTN = "px-3 py-1.5 rounded-lg text-sm border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50";
const BTN_P = "px-3 py-1.5 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50";

export interface ServicoOpcao { id: number; nome: string }
export interface DadosTarefaDp {
  codigoErp: string;
  servicos: ServicoOpcao[];
  mesInicial: string;
  qtdMeses: number;
  diaVencimento: number | null;
  observacoes: string;
}

export function dadosTarefaDpVazio(): DadosTarefaDp {
  const d = new Date();
  return { codigoErp: "", servicos: [], mesInicial: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, qtdMeses: 1, diaVencimento: null, observacoes: "" };
}

export function erroTarefaDp(v: DadosTarefaDp): string | null {
  if (!/^\d+-\d+$/.test(v.codigoErp.trim())) return "Informe o código ERP da empresa (ex.: 1467-1).";
  if (!v.servicos.length) return "Escolha pelo menos um serviço.";
  if (!v.mesInicial) return "Informe o mês.";
  return null;
}

export function resumoTarefaDp(v: DadosTarefaDp): string {
  return [
    `Pedido de inclusão de tarefa no Tareffa (DP)`,
    `Empresa: ${v.codigoErp}`,
    `Serviços: ${v.servicos.map((s) => s.nome).join("; ")}`,
    `A partir de: ${v.mesInicial.split("-").reverse().join("/")} · ${v.qtdMeses} mês(es)`,
    v.diaVencimento ? `Dia de vencimento: ${v.diaVencimento}` : "",
    v.observacoes ? `Observações: ${v.observacoes}` : "",
  ].filter(Boolean).join("\n");
}

let cacheServicos: ServicoOpcao[] | null = null;

export function FormTarefaDp({ valor, onChange }: { valor: DadosTarefaDp; onChange: (v: DadosTarefaDp) => void }) {
  const [servicos, setServicos] = useState<ServicoOpcao[]>(cacheServicos ?? []);
  const [busca, setBusca] = useState("");
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<string | null>(null);

  useEffect(() => {
    if (cacheServicos) return;
    fetch("/api/tareffa/dp").then((r) => r.json()).then((j) => {
      if (j.error) { setErroLista(j.error); return; }
      cacheServicos = j.servicos ?? [];
      setServicos(cacheServicos!);
    }).catch(() => setErroLista("Não foi possível carregar os serviços do Tareffa."));
  }, []);

  useEffect(() => {
    const erp = valor.codigoErp.trim();
    if (!/^\d+-\d+$/.test(erp)) { setEmpresa(null); return; }
    const t = setTimeout(() => {
      setEmpresa("Buscando…");
      fetch(`/api/tareffa/dp?erp=${encodeURIComponent(erp)}`).then((r) => r.json()).then((j) => {
        if (j.error) setEmpresa(`Erro: ${j.error}`);
        else if (!j.empresa) setEmpresa("Não encontrada no Tareffa.");
        else setEmpresa(`${j.empresa.razaoSocial}${j.empresa.situacao != null && j.empresa.situacao !== 1 ? " (não ativa)" : ""}`);
      }).catch(() => setEmpresa(null));
    }, 500);
    return () => clearTimeout(t);
  }, [valor.codigoErp]);

  const filtrados = useMemo(() => {
    const b = busca.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    if (b.length < 2) return [];
    return servicos.filter((s) => s.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(b)).slice(0, 50);
  }, [busca, servicos]);

  const set = (p: Partial<DadosTarefaDp>) => onChange({ ...valor, ...p });
  const marcado = (id: number) => valor.servicos.some((s) => s.id === id);
  const alternar = (s: ServicoOpcao) => set({ servicos: marcado(s.id) ? valor.servicos.filter((x) => x.id !== s.id) : [...valor.servicos, s] });
  const lbl = "block text-xs uppercase tracking-widest text-slate-500 mb-1.5";

  return (
    <div className="space-y-3 border border-blue-200 dark:border-blue-900 rounded-lg p-3 bg-blue-50/40 dark:bg-blue-950/20">
      <p className="text-xs text-slate-500">Piloto: a T.I. confere e gera a tarefa no Tareffa depois de aprovar.</p>
      <label className="block">
        <span className={lbl}>Empresa (código ERP)</span>
        <input className={`${INPUT} w-full`} placeholder="1467-1" value={valor.codigoErp} onChange={(e) => set({ codigoErp: e.target.value })} />
        {empresa && <span className="block text-xs mt-1 text-slate-600 dark:text-slate-400">{empresa}</span>}
      </label>
      <div>
        <span className={lbl}>Serviços ({valor.servicos.length} escolhido{valor.servicos.length === 1 ? "" : "s"})</span>
        {valor.servicos.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {valor.servicos.map((s) => (
              <button key={s.id} type="button" onClick={() => alternar(s)} className="text-xs bg-blue-600 text-white rounded px-2 py-0.5">{s.nome} ✕</button>
            ))}
          </div>
        )}
        <input className={`${INPUT} w-full mb-1`} placeholder="Buscar serviço (ex.: pensão, VT, cesta)" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {erroLista && <p className="text-xs text-red-600">{erroLista}</p>}
        {busca.trim().length >= 2 && (
        <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
          {filtrados.map((s) => (
            <label key={s.id} className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
              <input type="checkbox" checked={marcado(s.id)} onChange={() => alternar(s)} />
              <span>{s.nome}</span>
            </label>
          ))}
          {!filtrados.length && !erroLista && <p className="text-xs text-slate-500 p-2">{servicos.length ? "Nenhum serviço com esse nome." : "Carregando…"}</p>}
        </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className={lbl}>A partir de</span>
          <input type="month" className={`${INPUT} w-full`} value={valor.mesInicial} onChange={(e) => set({ mesInicial: e.target.value })} />
        </label>
        <label className="block">
          <span className={lbl}>Meses</span>
          <select className={`${INPUT} w-full`} value={valor.qtdMeses} onChange={(e) => set({ qtdMeses: Number(e.target.value) })}>
            <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
          </select>
        </label>
        <label className="block">
          <span className={lbl}>Dia venc. (opc.)</span>
          <input type="number" min={1} max={31} className={`${INPUT} w-full`} value={valor.diaVencimento ?? ""} onChange={(e) => set({ diaVencimento: e.target.value ? Number(e.target.value) : null })} />
        </label>
      </div>
      <label className="block">
        <span className={lbl}>Observações da tarefa (opcional)</span>
        <textarea rows={2} className={`${INPUT} w-full`} value={valor.observacoes} onChange={(e) => set({ observacoes: e.target.value })} />
      </label>
    </div>
  );
}

interface Resultado { servico: string; mes: string; ok: boolean; simulacao: boolean; mensagem: string; programacaoId: number | null }
interface Pedido extends DadosTarefaDp { empresaNome: string | null; status: string; criadoPor: string; resultados: Resultado[] }

/** Painel no detalhe do ticket: mostra o pedido e (T.I.) simula/gera no Tareffa. */
export function PainelTarefaDp({ ticketId, podeGerar }: { ticketId: string; podeGerar: boolean }) {
  const [pedido, setPedido] = useState<Pedido | null | undefined>(undefined);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    fetch(`/api/tickets/${ticketId}/tarefa-dp`).then((r) => r.json()).then((j) => setPedido(j.pedido ?? null)).catch(() => setPedido(null));
  }, [ticketId]);

  async function agir(acao: "simular" | "gerar") {
    setOcupado(true); setErro(null);
    try {
      const r = await fetch(`/api/tickets/${ticketId}/tarefa-dp`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErro(j.error ?? "Falhou.");
      else setPedido(j.pedido);
    } finally { setOcupado(false); setConfirmar(false); }
  }

  if (!pedido) return null;
  const sim = pedido.resultados.filter((r) => r.simulacao);
  const reais = pedido.resultados.filter((r) => !r.simulacao);
  const cor = pedido.status === "concluido" ? "text-green-600" : pedido.status === "com_erro" ? "text-red-600" : "text-amber-600";

  return (
    <div className="border border-blue-200 dark:border-blue-900 rounded-lg p-3 bg-blue-50/40 dark:bg-blue-950/20 text-sm space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-widest text-slate-500">Tarefa no Tareffa (DP)</h3>
        <span className={`text-xs font-semibold ${cor}`}>{pedido.status === "concluido" ? "Gerado" : pedido.status === "com_erro" ? "Com erro" : "Aguardando T.I."}</span>
      </div>
      <p><b>Empresa:</b> {pedido.codigoErp}{pedido.empresaNome ? ` — ${pedido.empresaNome}` : ""}</p>
      <p><b>Serviços:</b> {pedido.servicos.map((s) => s.nome).join("; ")}</p>
      <p><b>A partir de:</b> {pedido.mesInicial.split("-").reverse().join("/")} · {pedido.qtdMeses} mês(es){pedido.diaVencimento ? ` · vencimento dia ${pedido.diaVencimento}` : ""}</p>
      {pedido.observacoes && <p><b>Obs.:</b> {pedido.observacoes}</p>}
      {erro && <p className="text-red-600">{erro}</p>}
      {[...reais, ...sim].length > 0 && (
        <ul className="space-y-1">
          {[...reais, ...sim].map((r, i) => (
            <li key={i} className={r.ok ? (r.simulacao ? "text-slate-600 dark:text-slate-400" : "text-green-700 dark:text-green-400") : "text-red-600"}>
              {r.simulacao ? "🔎" : r.ok ? "✅" : "❌"} {r.servico} · {r.mes}: {r.mensagem}
            </li>
          ))}
        </ul>
      )}
      {podeGerar && pedido.status !== "concluido" && (
        <div className="flex gap-2 pt-1">
          <button className={BTN} disabled={ocupado} onClick={() => agir("simular")}>{ocupado ? "…" : "1) Simular"}</button>
          {!confirmar
            ? <button className={BTN_P} disabled={ocupado || !sim.length} title={!sim.length ? "Simule primeiro" : ""} onClick={() => setConfirmar(true)}>2) Aprovar e gerar</button>
            : <button className="px-3 py-1.5 rounded-lg text-sm bg-red-600 text-white" disabled={ocupado} onClick={() => agir("gerar")}>Confirmar geração no Tareffa</button>}
        </div>
      )}
    </div>
  );
}
