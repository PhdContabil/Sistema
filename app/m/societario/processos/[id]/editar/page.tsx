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
  if (processo.source !== "local") {
    // Só processos locais podem ser editados
    redirect(`/m/societario/processos/${id}`);
  }

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
        tipos={tipos.map((t) => t.name)}
        initial={processo}
        submitLabel="Salvar alterações"
      />
    </div>
  );
}
