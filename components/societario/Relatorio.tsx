"use client";

import { useMemo, useState } from "react";

export interface ProcRel {
  id: number;
  empresa: string;
  doc: string;
  tipo: string;
  tag: string;
  status: string;
  responsavel: string;
  inicio: string;
  encerrado: string;
  valor: number | null;
  atividades: { nome: string; responsavel: string; coresp: string; situacao: string; prazo: string; encerrada: string }[];
}

const SECOES = [
  ["resumo", "Resumo (totais)"],
  ["status", "Por status"],
  ["tipo", "Por tipo de processo"],
  ["responsavel", "Por responsável"],
  ["processos", "Lista de processos"],
  ["atrasadas", "Atividades atrasadas"],
] as const;
type Secao = (typeof SECOES)[number][0];

const fmt = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const brl = (v: number | null) => (v == null ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const FECHADO = /CONCLU|CANCEL/i;

function contar<T>(lista: T[], chave: (x: T) => string) {
  const m = new Map<string, number>();
  for (const x of lista) m.set(chave(x) || "—", (m.get(chave(x) || "—") ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function Relatorio({ processos, tipos, statusLista, responsaveis }: { processos: ProcRel[]; tipos: string[]; statusLista: string[]; responsaveis: string[] }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [de, setDe] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [ate, setAte] = useState(hoje);
  const [fTipos, setFTipos] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<string[]>([]);
  const [fResp, setFResp] = useState<string[]>([]);
  const [secoes, setSecoes] = useState<Secao[]>(SECOES.map((s) => s[0]));

  const lista = useMemo(() => processos.filter((p) =>
    (!de || p.inicio >= de) && (!ate || p.inicio <= ate) &&
    (!fTipos.length || fTipos.includes(p.tipo)) &&
    (!fStatus.length || fStatus.includes(p.status)) &&
    (!fResp.length || fResp.includes(p.responsavel))), [processos, de, ate, fTipos, fStatus, fResp]);

  const atrasadas = useMemo(() => lista.flatMap((p) => p.atividades
    .filter((a) => a.prazo && a.prazo < hoje && !a.encerrada && !/CONCLU|N[AÃ]O SE APLICA|CANCEL/i.test(a.situacao))
    .map((a) => ({ p, a }))), [lista, hoje]);

  const tem = (s: Secao) => secoes.includes(s);
  const abertos = lista.filter((p) => !FECHADO.test(p.status)).length;
  const concluidos = lista.filter((p) => /CONCLU/i.test(p.status)).length;
  const valor = lista.reduce((t, p) => t + (p.valor || 0), 0);

  /** Tabelas do relatório (servem para a tela, o Excel e o PDF). */
  const tabelas: { titulo: string; cab: string[]; linhas: (string | number)[][] }[] = [];
  if (tem("resumo")) tabelas.push({ titulo: "Resumo", cab: ["Indicador", "Valor"], linhas: [
    ["Processos no período", lista.length], ["Em aberto", abertos], ["Concluídos", concluidos],
    ["Cancelados", lista.filter((p) => /CANCEL/i.test(p.status)).length], ["Atividades atrasadas", atrasadas.length], ["Valor total", brl(valor)],
  ] });
  if (tem("status")) tabelas.push({ titulo: "Por status", cab: ["Status", "Processos"], linhas: contar(lista, (p) => p.status) });
  if (tem("tipo")) tabelas.push({ titulo: "Por tipo de processo", cab: ["Tipo", "Processos"], linhas: contar(lista, (p) => p.tipo + (p.tag ? ` · ${p.tag}` : "")) });
  if (tem("responsavel")) {
    const m = new Map<string, { t: number; a: number; c: number; atr: number }>();
    for (const p of lista) {
      const k = p.responsavel || "—";
      const x = m.get(k) ?? { t: 0, a: 0, c: 0, atr: 0 };
      x.t++; if (/CONCLU/i.test(p.status)) x.c++; else if (!FECHADO.test(p.status)) x.a++;
      m.set(k, x);
    }
    for (const { a } of atrasadas) { const k = a.responsavel || "—"; const x = m.get(k) ?? { t: 0, a: 0, c: 0, atr: 0 }; x.atr++; m.set(k, x); }
    tabelas.push({ titulo: "Por responsável", cab: ["Responsável", "Processos", "Em aberto", "Concluídos", "Atividades atrasadas"],
      linhas: [...m.entries()].sort((a, b) => b[1].t - a[1].t).map(([k, x]) => [k, x.t, x.a, x.c, x.atr]) });
  }
  if (tem("processos")) tabelas.push({ titulo: "Processos", cab: ["Empresa", "CNPJ/CPF", "Tipo", "Status", "Responsável", "Início", "Encerrado", "Valor"],
    linhas: lista.map((p) => [p.empresa, p.doc, p.tipo + (p.tag ? ` · ${p.tag}` : ""), p.status, p.responsavel, fmt(p.inicio), fmt(p.encerrado), brl(p.valor)]) });
  if (tem("atrasadas")) tabelas.push({ titulo: "Atividades atrasadas", cab: ["Empresa", "Processo", "Atividade", "Responsável", "Corresponsável", "Prazo", "Situação"],
    linhas: atrasadas.map(({ p, a }) => [p.empresa, p.tipo, a.nome, a.responsavel, a.coresp, fmt(a.prazo), a.situacao]) });

  const filtrosTxt = `Período ${fmt(de)} a ${fmt(ate)}${fTipos.length ? ` · Tipos: ${fTipos.join(", ")}` : ""}${fStatus.length ? ` · Status: ${fStatus.join(", ")}` : ""}${fResp.length ? ` · Responsáveis: ${fResp.join(", ")}` : ""}`;
  const esc = (v: unknown) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const html = () => `<h1>Relatório do Societário</h1><p>${esc(filtrosTxt)}<br>Gerado em ${new Date().toLocaleString("pt-BR")}</p>` +
    tabelas.map((t) => `<h2>${esc(t.titulo)}</h2><table border="1" cellspacing="0" cellpadding="4"><tr>${t.cab.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${t.linhas.map((l) => `<tr>${l.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table>`).join("");

  function excel() {
    const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>${html()}</body></html>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + doc], { type: "application/vnd.ms-excel" }));
    a.download = `Relatorio Societario ${de} a ${ate}.xls`;
    a.click();
  }
  function pdf() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><meta charset="utf-8"><title>Relatório do Societário</title><style>body{font-family:Arial,sans-serif;font-size:11px;margin:24px}h1{font-size:18px}h2{font-size:14px;margin-top:18px}table{border-collapse:collapse;width:100%}th{background:#eee;text-align:left}td,th{border:1px solid #bbb;padding:4px}</style></head><body>${html()}<script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  const Multi = ({ rot, ops, sel, set }: { rot: string; ops: string[]; sel: string[]; set: (v: string[]) => void }) => (
    <details className="border border-gray-300 rounded bg-white">
      <summary className="px-2 py-1.5 text-sm cursor-pointer">{rot}: {sel.length ? `${sel.length} selecionado(s)` : "Todos"}</summary>
      <div className="max-h-56 overflow-auto px-2 pb-2">
        <button type="button" className="text-xs text-brand-700" onClick={() => set([])}>Limpar</button>
        {ops.map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm py-0.5">
            <input type="checkbox" checked={sel.includes(o)} onChange={() => set(sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o])} /> {o}
          </label>
        ))}
      </div>
    </details>
  );

  return (
    <div className="space-y-4">
      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-start">
          <label className="text-xs text-gray-500">De<input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="block w-full border border-gray-300 rounded px-2 py-1.5 text-sm" /></label>
          <label className="text-xs text-gray-500">Até<input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="block w-full border border-gray-300 rounded px-2 py-1.5 text-sm" /></label>
          <Multi rot="Tipos" ops={tipos} sel={fTipos} set={setFTipos} />
          <Multi rot="Status" ops={statusLista} sel={fStatus} set={setFStatus} />
          <Multi rot="Responsáveis" ops={responsaveis} sel={fResp} set={setFResp} />
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Informações do relatório</div>
          <div className="flex flex-wrap gap-3 items-center">
            {SECOES.map(([k, rot]) => (
              <label key={k} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={tem(k)} onChange={() => setSecoes(tem(k) ? secoes.filter((x) => x !== k) : [...secoes, k])} /> {rot}
              </label>
            ))}
            <button type="button" onClick={() => setSecoes(SECOES.map((s) => s[0]))} className="text-xs text-brand-700 border border-brand-200 rounded px-2 py-1">Todas as informações</button>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={excel} disabled={!tabelas.length} className="bg-emerald-700 text-white text-sm rounded px-4 py-1.5 disabled:opacity-50">Baixar Excel</button>
          <button type="button" onClick={pdf} disabled={!tabelas.length} className="bg-brand-700 text-white text-sm rounded px-4 py-1.5 disabled:opacity-50">Gerar PDF</button>
          <span className="text-xs text-gray-500 self-center">{lista.length} processo(s) no filtro</span>
        </div>
      </section>

      {tabelas.map((t) => (
        <section key={t.titulo} className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold mb-2">{t.titulo}</h3>
          <div className="overflow-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-500"><tr>{t.cab.map((c) => <th key={c} className="py-1.5 pr-3">{c}</th>)}</tr></thead>
              <tbody>{t.linhas.map((l, i) => <tr key={i} className="border-t">{l.map((c, j) => <td key={j} className="py-1.5 pr-3">{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
