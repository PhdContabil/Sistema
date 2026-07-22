import { listTipos } from "@/lib/societario/tiposProcesso";
import { TiposProcessoTable } from "./TiposProcessoTable";
import {
  createTipoAction,
  deleteTipoAction,
  toggleAtivoAction,
  updateTipoAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function TiposProcessoPage() {
  const tipos = await listTipos();
  const ativos = tipos.filter((t) => t.active).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Tipos de processo</h1>
        <p className="text-sm text-gray-500">
          Cadastro dos tipos de processo do societário · {ativos} ativos de{" "}
          {tipos.length}
        </p>
      </header>

      <TiposProcessoTable
        tipos={tipos}
        onCreate={createTipoAction}
        onUpdate={updateTipoAction}
        onToggle={toggleAtivoAction}
        onDelete={deleteTipoAction}
      />
    </div>
  );
}
