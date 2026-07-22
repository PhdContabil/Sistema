import Link from "next/link";
import { ProcessoForm } from "@/components/societario/ProcessoForm";
import { createProcessoAction } from "./actions";
import { listTiposAtivos } from "@/lib/societario/tiposProcesso";

export const dynamic = "force-dynamic";

export default async function NovoProcessoPage() {
  const tipos = await listTiposAtivos();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/m/societario/processos"
          className="text-sm text-brand-700 hover:underline"
        >
          ← Voltar para processos
        </Link>
      </div>
      <header>
        <h1 className="text-2xl font-bold">Novo processo societário</h1>
        <p className="text-sm text-gray-500">
          Para editar tipos disponíveis, vá em{" "}
          <Link
            href="/m/societario/tipos-processo"
            className="text-brand-700 hover:underline"
          >
            Tipos de processo
          </Link>
          .
        </p>
      </header>

      <ProcessoForm
        action={createProcessoAction}
        tipos={tipos.map((t) => t.name)}
      />
    </div>
  );
}
