"use client";

// Termo de empréstimo de um equipamento do inventário: gera o link de assinatura, mostra os termos
// do item (pendente / assinado / devolvido) e permite cancelar ou registrar a devolução.
import { useEffect, useState } from "react";
import type { ItemInventario } from "@/lib/inventario";
import { INPUT, BTN, BTN_PRIMARY } from "./TicketsBoard";

interface TermoLista {
  id: number; status: string; link: string;
  equipamento: { item_id: number };
  colaborador: { nome: string; setor: string | null; email: string | null };
  data_entrega: string; criado_em: string; devolvido_em: string | null;
  assinatura: { nome: string; em: string } | null;
}
interface Pessoa { id: number; nome: string; email: string | null; setor: string | null }

const dt = (s: string | null) => (s ? new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleDateString("pt-BR") : "—");
const ROT: Record<string, string> = { pendente: "Aguardando assinatura", assinado: "Assinado", devolvido: "Devolvido", cancelado: "Cancelado" };
const COR: Record<string, string> = { pendente: "#b45309", assinado: "#15803d", devolvido: "#64748b", cancelado: "#94a3b8" };

export default function InventarioTermo({ item, fechar }: { item: ItemInventario; fechar: () => void }) {
  const [termos, setTermos] = useState<TermoLista[] | null>(null);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const [f, setF] = useState({ pessoa_id: "", nome: item.responsavel ?? "", email: "", setor: item.setor ?? "", identificacao: "", acessorios: "Carregador", condicao: "Bom estado", data_entrega: hoje, devolucao_prevista: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function carregar() {
    const r = await fetch("/api/inventario/termos", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) { setErro(j.error); return; }
    setTermos((j.termos as TermoLista[]).filter((t) => t.equipamento.item_id === item.id).sort((a, b) => b.criado_em.localeCompare(a.criado_em)));
    setPessoas(j.pessoas ?? []);
  }
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function escolherPessoa(id: string) {
    const p = pessoas.find((x) => String(x.id) === id);
    setF({ ...f, pessoa_id: id, nome: p?.nome ?? f.nome, email: p?.email ?? "", setor: p?.setor ?? f.setor });
  }

  async function gerar() {
    setErro(null); setMsg(null); setOcupado(true);
    try {
      const r = await fetch("/api/inventario/termos", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, item_id: item.id, pessoa_id: f.pessoa_id ? Number(f.pessoa_id) : null }) });
      const j = await r.json();
      if (!r.ok) { setErro(j.error); return; }
      await navigator.clipboard?.writeText(j.link).catch(() => null);
      setMsg("Termo gerado. Link copiado — envie para a pessoa assinar (Teams ou e-mail).");
      carregar();
    } finally { setOcupado(false); }
  }

  async function acao(t: TermoLista, a: "cancelar" | "devolver") {
    const obs = a === "devolver" ? prompt("Devolução — estado do equipamento / observação (opcional):") : null;
    if (a === "devolver" && obs === null) return;
    if (a === "cancelar" && !confirm("Cancelar este termo? O link deixa de funcionar.")) return;
    const r = await fetch(`/api/inventario/termos/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: a, obs }) });
    const j = await r.json();
    if (!r.ok) setErro(j.error); else carregar();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4" onClick={fechar}>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl text-slate-900 dark:text-slate-200 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold">Termo de responsabilidade</h2>
            <div className="text-xs text-slate-500">{item.item} {item.marca ?? ""} {item.especificacao ? `· ${item.especificacao}` : ""}</div>
          </div>
          <button onClick={fechar} aria-label="Fechar" className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">✕</button>
        </div>

        <div className="px-6 py-4 space-y-3">
          {msg && <div className="text-sm text-green-700 dark:text-green-400">{msg}</div>}
          {erro && <div className="text-sm text-red-600">{erro}</div>}

          <h3 className="text-xs uppercase tracking-widest text-slate-500">Termos deste equipamento</h3>
          {termos === null ? <p className="text-sm text-slate-500">Carregando…</p> : termos.length === 0 ? <p className="text-sm text-slate-500">Nenhum termo ainda.</p> : (
            <div className="space-y-2">
              {termos.map((t) => (
                <div key={t.id} className="border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm flex flex-wrap items-center gap-2 justify-between">
                  <div>
                    <b>{t.colaborador.nome}</b>{t.colaborador.setor ? ` · ${t.colaborador.setor}` : ""} · entrega {dt(t.data_entrega)}
                    <div className="text-xs" style={{ color: COR[t.status] }}>
                      {ROT[t.status] ?? t.status}{t.assinatura ? ` em ${dt(t.assinatura.em)}` : ""}{t.devolvido_em ? ` · devolvido em ${dt(t.devolvido_em)}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {t.status !== "cancelado" && <a className={BTN} href={t.link} target="_blank" rel="noreferrer">{t.status === "pendente" ? "Abrir link" : "Ver termo"}</a>}
                    {t.status === "pendente" && <button className={BTN} onClick={() => { navigator.clipboard?.writeText(t.link); setMsg("Link copiado."); }}>Copiar link</button>}
                    {t.status === "pendente" && <button className={BTN} onClick={() => acao(t, "cancelar")}>Cancelar</button>}
                    {t.status === "assinado" && <button className={BTN} onClick={() => acao(t, "devolver")}>Registrar devolução</button>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <h3 className="text-xs uppercase tracking-widest text-slate-500 pt-3">Novo empréstimo</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="col-span-2">Colaborador (cadastro de Pessoas)
              <select className={INPUT} value={f.pessoa_id} onChange={(e) => escolherPessoa(e.target.value)}>
                <option value="">— Outra pessoa (terceiro) —</option>
                {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.setor ? ` · ${p.setor}` : ""}</option>)}
              </select>
            </label>
            <label>Nome *<input className={INPUT} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
            <label>Setor<input className={INPUT} value={f.setor} onChange={(e) => setF({ ...f, setor: e.target.value })} /></label>
            <label>E-mail<input className={INPUT} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
            <label>Nº de série / patrimônio<input className={INPUT} value={f.identificacao} onChange={(e) => setF({ ...f, identificacao: e.target.value })} /></label>
            <label>Acessórios<input className={INPUT} value={f.acessorios} onChange={(e) => setF({ ...f, acessorios: e.target.value })} /></label>
            <label>Condição na entrega<input className={INPUT} value={f.condicao} onChange={(e) => setF({ ...f, condicao: e.target.value })} /></label>
            <label>Data da entrega<input type="date" className={INPUT} value={f.data_entrega} onChange={(e) => setF({ ...f, data_entrega: e.target.value })} /></label>
            <label>Devolução prevista (opcional)<input type="date" className={INPUT} value={f.devolucao_prevista} onChange={(e) => setF({ ...f, devolucao_prevista: e.target.value })} /></label>
          </div>
          <p className="text-xs text-slate-500">Ao assinar, o equipamento fica atrelado a essa pessoa no inventário. O link não exige login.</p>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
          <button className={BTN} onClick={fechar}>Fechar</button>
          <button className={BTN_PRIMARY} onClick={gerar} disabled={ocupado || !f.nome.trim()}>{ocupado ? "Gerando…" : "Gerar termo e copiar link"}</button>
        </div>
      </div>
    </div>
  );
}
