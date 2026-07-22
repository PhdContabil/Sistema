import Link from "next/link";
import { loadAll } from "@/lib/societario/dataSource";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: { q?: string };
}

export default async function EmpresasPage({ searchParams }: PageProps) {
  const snap = await loadAll();
  const q = (searchParams.q || "").toLowerCase();

  // Agrega por inscrição (CNPJ) ou, na ausência, por nome
  const map = new Map<
    string,
    {
      key: string;
      name: string;
      inscription: string;
      total: number;
      abertos: number;
      concluidos: number;
      lastUpdated: string;
    }
  >();

  for (const p of snap.processos) {
    const key = p.inscription || p.name;
    const status = p.status.toUpperCase();
    const isOpen = !(status.includes("CONCL") || status.includes("CANCEL"));
    const cur = map.get(key);
    if (cur) {
      cur.total++;
      if (isOpen) cur.abertos++;
      if (status.includes("CONCL")) cur.concluidos++;
      if (p.updated_in > cur.lastUpdated) cur.lastUpdated = p.updated_in;
    } else {
      map.set(key, {
        key,
        name: p.name,
        inscription: p.inscription,
        total: 1,
        abertos: isOpen ? 1 : 0,
        concluidos: status.includes("CONCL") ? 1 : 0,
        lastUpdated: p.updated_in || "",
      });
    }
  }

  const empresas = Array.from(map.values())
    .filter(
      (e) =>
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.inscription.toLowerCase().includes(q)
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Empresas</h1>
        <p className="text-sm text-gray-500">
          {empresas.length} empresa(s) com processos cadastrados.
        </p>
      </header>

      <form
        action="/m/societario/empresas"
        className="bg-white border border-gray-200 rounded-lg p-4 flex gap-3 items-end"
      >
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Buscar</label>
          <input
            name="q"
            defaultValue={q}
            placeholder="Nome ou CNPJ..."
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          className="bg-brand-700 hover:bg-brand-900 text-white text-sm font-medium rounded px-4 py-1.5"
        >
          Buscar
        </button>
      </form>

      {empresas.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
          Nenhuma empresa encontrada.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2.5">Empresa</th>
                  <th className="px-4 py-2.5">CNPJ</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Abertos</th>
                  <th className="px-4 py-2.5 text-right">Concluídos</th>
                </tr>
              </thead>
              <tbody>
                {empresas.slice(0, 1000).map((e) => (
                  <tr key={e.key} className="border-t">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/m/societario/processos?q=${encodeURIComponent(e.name)}`}
                        className="font-medium hover:underline"
                      >
                        {e.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                      {e.inscription || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">{e.total}</td>
                    <td className="px-4 py-2.5 text-right text-amber-600">
                      {e.abertos}
                    </td>
                    <td className="px-4 py-2.5 text-right text-emerald-600">
                      {e.concluidos}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
