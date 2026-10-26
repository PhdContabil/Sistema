"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface AtividadeAberta {
  processoId: number;
  empresa: string;
  processo: string;
  atividade: string;
  responsavel: string;
  corresponsavel: string;
  prazo: string | null;
  situacao: string | null;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

interface Linha { a: AtividadeAberta; papel: "Responsável" | "Corresponsável" }

/** Atividades em ANÁLISE: Pessoa -> Empresas -> Atividades. */
export function AtividadesPorPessoa({ atividades }: { atividades: AtividadeAberta[] }) {
  const [pessoa, setPessoa] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState<string | null>(null);
  const hoje = new Date().toISOString().slice(0, 10);

  const pessoas = useMemo(() => {
    const m = new Map<string, Linha[]>();
    const add = (n: string, l: Linha) => {
      const k = n.trim().toUpperCase();
      if (!k) return;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(l);
    };
    for (const a of atividades) {
      add(a.responsavel, { a, papel: "Responsável" });
      if (a.corresponsavel && a.corresponsavel.toUpperCase() !== a.responsavel.toUpperCase()) add(a.corresponsavel, { a, papel: "Corresponsável" });
    }
    return [...m.entries()]
      .map(([nome, linhas]) => {
        const porEmpresa = new Map<string, Linha[]>();
        for (const l of linhas) {
          const k = `${l.a.processoId}|${l.a.empresa}`;
          if (!porEmpresa.has(k)) porEmpresa.set(k, []);
          porEmpresa.get(k)!.push(l);
        }
        return {
          nome,
          linhas,
          empresas: [...porEmpresa.entries()].map(([k, ls]) => ({ chave: k, empresa: ls[0].a.empresa, processo: ls[0].a.processo, processoId: ls[0].a.processoId, linhas: ls }))
            .sort((x, y) => x.empresa.localeCompare(y.empresa, "pt-BR")),
          co: linhas.filter((l) => l.papel === "Corresponsável").length,
          vencidas: linhas.filter((l) => l.a.prazo && l.a.prazo.slice(0, 10) < hoje).length,
        };
      })
      .sort((a, b) => b.linhas.length - a.linhas.length);
  }, [atividades, hoje]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="font-semibold">Atividades em análise por pessoa</h3>
      <p className="text-xs text-gray-500 mb-3">Clique na pessoa para ver as empresas; clique na empresa para ver as atividades.</p>
      {pessoas.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma atividade em análise.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="py-2">Pessoa</th>
              <th className="py-2 text-right">Empresas</th>
              <th className="py-2 text-right">Como corresponsável</th>
              <th className="py-2 text-right">Vencidas</th>
              <th className="py-2 text-right">Atividades</th>
            </tr>
          </thead>
          <tbody>
            {pessoas.map((p) => (
              <>
                <tr key={p.nome} className="border-t cursor-pointer hover:bg-gray-50" onClick={() => { setPessoa(pessoa === p.nome ? null : p.nome); setEmpresa(null); }}>
                  <td className="py-2 font-medium">{pessoa === p.nome ? "▾" : "▸"} {p.nome}</td>
                  <td className="py-2 text-right">{p.empresas.length}</td>
                  <td className="py-2 text-right">{p.co || "—"}</td>
                  <td className={`py-2 text-right ${p.vencidas ? "text-red-600 font-semibold" : "text-gray-400"}`}>{p.vencidas || "—"}</td>
                  <td className="py-2 text-right font-semibold">{p.linhas.length}</td>
                </tr>
                {pessoa === p.nome && (
                  <tr key={p.nome + "-det"}>
                    <td colSpan={5} className="pb-3">
                      <div className="bg-gray-50 rounded border border-gray-200 divide-y">
                        {p.empresas.map((e) => {
                          const aberta = empresa === e.chave;
                          const cos = [...new Set(e.linhas.map((l) => (l.papel === "Responsável" ? l.a.corresponsavel : l.a.responsavel)).filter(Boolean))];
                          return (
                            <div key={e.chave}>
                              <button type="button" onClick={() => setEmpresa(aberta ? null : e.chave)} className="w-full text-left px-3 py-2 flex items-center justify-between gap-3 hover:bg-white">
                                <span className="min-w-0">
                                  <span className="font-semibold">{aberta ? "▾" : "▸"} {e.empresa}</span>
                                  <span className="text-xs text-gray-500"> · {e.processo}{cos.length ? ` · com ${cos.join(", ")}` : ""}</span>
                                </span>
                                <span className="text-xs text-gray-600 whitespace-nowrap">{e.linhas.length} atividade(s)</span>
                              </button>
                              {aberta && (
                                <div className="px-6 pb-2 space-y-1">
                                  {e.linhas.map(({ a, papel }, i) => (
                                    <div key={i} className="flex items-start justify-between gap-3 text-xs bg-white border border-gray-200 rounded px-3 py-2">
                                      <div>
                                        <b>{a.atividade}</b>
                                        <div className="text-gray-500">
                                          {papel}
                                          {papel === "Responsável" && a.corresponsavel ? ` · corresponsável: ${a.corresponsavel}` : ""}
                                          {papel === "Corresponsável" && a.responsavel ? ` · responsável: ${a.responsavel}` : ""}
                                        </div>
                                      </div>
                                      <span className={`whitespace-nowrap ${a.prazo && a.prazo.slice(0, 10) < hoje ? "text-red-600 font-semibold" : "text-gray-600"}`}>Prazo {fmt(a.prazo)}</span>
                                    </div>
                                  ))}
                                  <Link href={`/m/societario/processos/${e.processoId}`} className="text-xs text-brand-700 hover:underline">Abrir o processo →</Link>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
