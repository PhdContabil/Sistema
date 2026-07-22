import Link from "next/link";
import { loadAll, weekKey } from "@/lib/societario/dataSource";
import { StatusPill } from "@/components/societario/StatusPill";
import { formatDate } from "@/lib/societario/tareffa";
import { listTiposAtivos } from "@/lib/societario/tiposProcesso";
import { ProcessosFilter } from "./ProcessosFilter";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { isAdmin } from "@/lib/societario/options";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: {
    q?: string;
    tipo?: string;
    status?: string;
    responsavel?: string;
    ano?: string;
    mes?: string;
    semana?: string;
    de?: string;
    ate?: string;
  };
}

export default async function ProcessosPage({ searchParams }: PageProps) {
  const [snap, tipos, user] = await Promise.all([
    loadAll(),
    listTiposAtivos(),
    getCurrentUser(),
  ]);
  const admin = isAdmin(user?.email);
  const q = (searchParams.q || "").toLowerCase();
  const tipo = searchParams.tipo || "";
  const status = searchParams.status || "";
  const responsavel = searchParams.responsavel || "";
  const ano = searchParams.ano || "";
  const mes = searchParams.mes || "";
  const semana = searchParams.semana || "";
  const de = searchParams.de || "";
  const ate = searchParams.ate || "";

  const filtered = snap.processos.filter((p) => {
    if (
      q &&
      !`${p.name} ${p.inscription} ${p.bearer || ""}`
        .toLowerCase()
        .includes(q)
    )
      return false;
    if (tipo && p.process !== tipo) return false;
    if (status && p.status.toUpperCase() !== status.toUpperCase())
      return false;
    if (responsavel) {
      const respUpper = (p.bearer || "").toUpperCase();
      if (!respUpper.includes(responsavel.toUpperCase())) return false;
    }
    if (ano && !(p.started_in || "").startsWith(ano)) return false;
    if (mes && !(p.started_in || "").startsWith(mes)) return false;
    if (semana && weekKey(p.started_in || "") !== semana) return false;
    if (de && (p.started_in || "") < de) return false;
    if (ate && (p.started_in || "") > ate) return false;
    return true;
  });

  const activeFilters: { label: string; key: string }[] = [];
  if (q) activeFilters.push({ label: `Busca: "${q}"`, key: "q" });
  if (tipo) activeFilters.push({ label: `Tipo: ${tipo}`, key: "tipo" });
  if (status) activeFilters.push({ label: `Status: ${status}`, key: "status" });
  if (responsavel)
    activeFilters.push({
      label: `Responsável: ${responsavel}`,
      key: "responsavel",
    });
  if (ano) activeFilters.push({ label: `Ano: ${ano}`, key: "ano" });
  if (mes) activeFilters.push({ label: `Mês: ${mes}`, key: "mes" });
  if (semana) activeFilters.push({ label: `Semana: ${semana}`, key: "semana" });
  if (de) activeFilters.push({ label: `De: ${de}`, key: "de" });
  if (ate) activeFilters.push({ label: `Até: ${ate}`, key: "ate" });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Processos</h1>
          <p className="text-sm text-gray-500">
            {snap.processos.length} processos no total ·{" "}
            {filtered.length} filtrados
          </p>
        </div>
        {admin && (
          <Link
            href="/m/societario/processos/novo"
            className="bg-brand-700 hover:bg-brand-900 text-white text-sm font-medium rounded px-4 py-2"
          >
            + Novo processo
          </Link>
        )}
      </header>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-500 uppercase">
            Filtros ativos:
          </span>
          {activeFilters.map((f) => {
            const newParams = new URLSearchParams();
            if (q && f.key !== "q") newParams.set("q", q);
            if (tipo && f.key !== "tipo") newParams.set("tipo", tipo);
            if (status && f.key !== "status") newParams.set("status", status);
            if (responsavel && f.key !== "responsavel")
              newParams.set("responsavel", responsavel);
            if (ano && f.key !== "ano") newParams.set("ano", ano);
            if (mes && f.key !== "mes") newParams.set("mes", mes);
            if (semana && f.key !== "semana") newParams.set("semana", semana);
            if (de && f.key !== "de") newParams.set("de", de);
            if (ate && f.key !== "ate") newParams.set("ate", ate);
            const href = `/m/societario/processos${
              newParams.toString() ? "?" + newParams.toString() : ""
            }`;
            return (
              <Link
                key={f.key}
                href={href}
                className="inline-flex items-center gap-1 text-xs bg-brand-100 text-brand-900 rounded-full px-2 py-1 hover:bg-brand-50"
              >
                {f.label} <span className="text-brand-700">×</span>
              </Link>
            );
          })}
          <Link
            href="/m/societario/processos"
            className="text-xs text-gray-500 hover:text-gray-900 underline"
          >
            limpar tudo
          </Link>
        </div>
      )}

      <ProcessosFilter
        tipos={tipos.map((t) => t.name)}
        initial={{ q, tipo, status, responsavel, de, ate }}
      />

      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
          Nenhum processo encontrado com esses filtros.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2.5">Empresa</th>
                  <th className="px-4 py-2.5">Processo</th>
                  <th className="px-4 py-2.5">Responsável</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Início</th>
                  <th className="px-4 py-2.5">Atualizado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 500).map((p) => (
                  <tr key={p.id} className="border-t align-top">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/m/societario/processos/${p.id}`}
                        className="font-medium hover:underline break-words"
                      >
                        {p.name}
                      </Link>
                      <div className="text-xs text-gray-500 whitespace-nowrap">
                        {p.inscription || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">{p.process}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {p.bearer || "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={p.status} />
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {formatDate(p.started_in)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {formatDate(p.updated_in)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 500 && (
            <div className="px-4 py-2.5 text-xs text-gray-500 border-t bg-gray-50">
              Mostrando 500 de {filtered.length} processos. Use os filtros para refinar.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
