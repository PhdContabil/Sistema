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

/** Atividades em aberto por pessoa (como responsável e como corresponsável), com detalhe por empresa. */
export function AtividadesPorPessoa({ atividades }: { atividades: AtividadeAberta[] }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const hoje = new Date().toISOString().slice(0, 10);

  const pessoas = useMemo(() => {
    const m = new Map<string, { resp: AtividadeAberta[]; co: AtividadeAberta[] }>();
    const pega = (n: string) => {
      const k = n.trim().toUpperCase();
      if (!m.has(k)) m.set(k, { resp: [], co: [] });
      return m.get(k)!;
    };
    for (const a of atividades) {
      if (a.responsavel) pega(a.responsavel).resp.push(a);
      if (a.corresponsavel && a.corresponsavel.toUpperCase() !== a.responsavel.toUpperCase()) pega(a.corresponsavel).co.push(a);
    }
    return [...m.entries()]
      .map(([nome, v]) => ({
        nome,
        ...v,
        vencidas: [...v.resp, ...v.co].filter((a) => a.prazo && a.prazo.slice(0, 10) < hoje).length,
      }))
      .sort((a, b) => b.resp.length + b.co.length - (a.resp.length + a.co.length));
  }, [atividades, hoje]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="font-semibold">Atividades em aberto por pessoa</h3>
      <p className="text-xs text-gray-500 mb-3">Clique na pessoa para ver as atividades, a empresa e o processo.</p>
      {pessoas.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma atividade em aberto com responsável.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="py-2">Pessoa</th>
              <th className="py-2 text-right">Responsável</th>
              <th className="py-2 text-right">Corresponsável</th>
              <th className="py-2 text-right">Vencidas</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {pessoas.map((p) => (
              <FragmentoPessoa key={p.nome} p={p} aberta={aberta === p.nome} alternar={() => setAberta(aberta === p.nome ? null : p.nome)} hoje={hoje} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FragmentoPessoa({
  p,
  aberta,
  alternar,
  hoje,
}: {
  p: { nome: string; resp: AtividadeAberta[]; co: AtividadeAberta[]; vencidas: number };
  aberta: boolean;
  alternar: () => void;
  hoje: string;
}) {
  const linhas = [
    ...p.resp.map((a) => ({ a, papel: "Responsável" })),
    ...p.co.map((a) => ({ a, papel: "Corresponsável" })),
  ].sort((x, y) => String(x.a.prazo || "9999").localeCompare(String(y.a.prazo || "9999")));
  return (
    <>
      <tr className="border-t cursor-pointer hover:bg-gray-50" onClick={alternar}>
        <td className="py-2 font-medium">{aberta ? "▾" : "▸"} {p.nome}</td>
        <td className="py-2 text-right">{p.resp.length}</td>
        <td className="py-2 text-right">{p.co.length}</td>
        <td className={`py-2 text-right ${p.vencidas ? "text-red-600 font-semibold" : "text-gray-400"}`}>{p.vencidas || "—"}</td>
        <td className="py-2 text-right font-semibold">{p.resp.length + p.co.length}</td>
      </tr>
      {aberta && (
        <tr>
          <td colSpan={5} className="pb-3">
            <div className="bg-gray-50 rounded border border-gray-200 divide-y">
              {linhas.map(({ a, papel }, i) => (
                <div key={i} className="px-3 py-2 flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <Link href={`/m/societario/processos/${a.processoId}`} className="font-semibold text-sm hover:underline">
                      {a.empresa}
                    </Link>
                    <div className="text-gray-600">
                      {a.processo} · <b>{a.atividade}</b>
                    </div>
                    <div className="text-gray-500">
                      {papel}
                      {papel === "Responsável" && a.corresponsavel ? ` · corresponsável: ${a.corresponsavel}` : ""}
                      {papel === "Corresponsável" && a.responsavel ? ` · responsável: ${a.responsavel}` : ""}
                      {a.situacao ? ` · ${a.situacao}` : ""}
                    </div>
                  </div>
                  <span className={`whitespace-nowrap ${a.prazo && a.prazo.slice(0, 10) < hoje ? "text-red-600 font-semibold" : "text-gray-600"}`}>
                    Prazo {fmt(a.prazo)}
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
