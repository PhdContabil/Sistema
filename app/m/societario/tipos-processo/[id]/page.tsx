import Link from "next/link";
import { notFound } from "next/navigation";
import { listTipos } from "@/lib/societario/tiposProcesso";
import { listarModelos, sugerirDoTareffa } from "@/lib/societario/tipoAtividades";
import { RESPONSAVEIS } from "@/lib/societario/options";
import { AtividadesTipoEditor } from "./AtividadesTipoEditor";
import { salvarAtividadesTipoAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function TipoProcessoPage({ params }: { params: { id: string } }) {
  const tipos = await listTipos();
  const tipo = tipos.find((t) => String(t.id) === params.id);
  if (!tipo) notFound();
  const modelos = await listarModelos();
  const atual = modelos[String(tipo.id)] ?? [];
  const sugestao = atual.length ? [] : await sugerirDoTareffa(tipo.name).catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/m/societario/tipos-processo" className="text-sm text-brand-700 hover:underline">
          ← Voltar para tipos de processo
        </Link>
      </div>
      <header>
        <h1 className="text-2xl font-bold">{tipo.name}</h1>
        <p className="text-sm text-gray-500">
          Atividades deste tipo de processo. Ao criar um processo deste tipo, elas já vêm preenchidas, com o prazo
          calculado em dias úteis a partir da data de início (cada atividade conta a partir da anterior).
        </p>
      </header>
      <AtividadesTipoEditor
        tipoId={String(tipo.id)}
        inicial={atual}
        sugestao={sugestao}
        responsaveis={[...RESPONSAVEIS]}
        salvar={salvarAtividadesTipoAction}
      />
    </div>
  );
}
