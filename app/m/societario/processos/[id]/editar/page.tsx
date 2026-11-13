import { tipoDescontinuado } from "@/lib/societario/aliasTipos";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadAll } from "@/lib/societario/dataSource";
import { listTiposAtivos } from "@/lib/societario/tiposProcesso";
import { ProcessoForm } from "@/components/societario/ProcessoForm";
import { updateProcessoAction } from "./actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

export default async function EditarProcessoPage({ params }: PageProps) {
  const id = Number(params.id);
  const [snap, tipos] = await Promise.all([loadAll(), listTiposAtivos()]);
  const processo = snap.processos.find((p) => p.id === id);
  if (!processo) notFound();
  // Desde a migração (13/11/2026) todos os processos são editáveis no Núcleo, inclusive os que vieram do Tareffa.

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/m/societario/processos/${id}`}
          className="text-sm text-brand-700 hover:underline"
        >
          ← Voltar para o processo
        </Link>
      </div>
      <header>
        <h1 className="text-2xl font-bold">Editar processo</h1>
        <p className="text-sm text-gray-500">{processo.name}</p>
      </header>

      <ProcessoForm
        action={updateProcessoAction.bind(null, id)}
        tipos={tipos.filter((t) => !tipoDescontinuado(t.name)).map((t) => t.name)}
        initial={processo}
        submitLabel="Salvar alterações"
      />
    </div>
  );
}
