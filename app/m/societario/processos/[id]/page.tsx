import Link from "next/link";
import { notFound } from "next/navigation";
import { loadAll } from "@/lib/societario/dataSource";
import { StatusPill } from "@/components/societario/StatusPill";
import { formatDate } from "@/lib/societario/tareffa";
import { AtividadesTable } from "./AtividadesTable";
import { deleteAction, updateActivityAction, updateActivityObsAction, criarServicosTareffaAction, comunicarCancelamentoAction } from "./actions";
import { ServicosTareffa } from "@/components/societario/ServicosTareffa";
import { servicosDoProcesso } from "@/lib/societario/tareffaServicos";
import { listTipos } from "@/lib/societario/tiposProcesso";
import { listarModelos } from "@/lib/societario/tipoAtividades";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { isAdmin } from "@/lib/societario/options";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

export default async function ProcessoDetailPage({ params }: PageProps) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();
  const [snap, user] = await Promise.all([loadAll(), getCurrentUser()]);
  const processo = snap.processos.find((p) => p.id === id);
  if (!processo) notFound();

  const isLocal = processo.source === "local";
  const admin = isAdmin(user?.email);
  const [servTareffa, tiposProc, modelosProc] = await Promise.all([
    servicosDoProcesso(processo.id).catch(() => []),
    listTipos().catch(() => []),
    listarModelos().catch(() => ({} as Record<string, { servicoTareffa?: { id: number } }[]>)),
  ]);
  const tipoProc = tiposProc.find((t) => t.name === processo.process);
  const previstosTareffa = tipoProc ? (modelosProc[String(tipoProc.id)] ?? []).filter((m) => m.servicoTareffa?.id).length : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/m/societario/processos"
          className="text-sm text-brand-700 hover:underline"
        >
          ← Voltar para processos
        </Link>
        <div className="flex gap-3">
          {isLocal && (
            <Link
              href={`/m/societario/processos/${id}/editar`}
              className="text-sm text-brand-700 hover:text-brand-900"
            >
              Editar processo
            </Link>
          )}
          {isLocal && admin && (
            <form action={deleteAction.bind(null, id)}>
              <button
                type="submit"
                className="text-sm text-red-600 hover:text-red-800"
              >
                Excluir processo
              </button>
            </form>
          )}
        </div>
      </div>

      <header>
        <h1 className="text-2xl font-bold break-words">{processo.name}</h1>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500 mt-1">
          <span className="whitespace-nowrap">
            {(processo.inscription || "").replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ"} {processo.inscription || "—"}
          </span>
          <span className="text-gray-300">·</span>
          <span className="whitespace-nowrap">ID #{processo.id}</span>
        </div>
      </header>

      <section className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
        <Field label="Processo" value={processo.tag ? `${processo.process} · ${processo.tag}` : processo.process} />
        <Field
          label="Status"
          value={<StatusPill status={processo.status} />}
        />
        <Field label="Responsável" value={processo.bearer || "—"} />
        <Field label="Início" value={formatDate(processo.started_in)} />
        <Field
          label="Encerrado em"
          value={formatDate(processo.closed_in)}
        />
        <Field
          label="Última atualização"
          value={formatDate(processo.updated_in)}
        />
        <Field
          label="Valor"
          value={
            processo.value != null
              ? processo.value.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })
              : "—"
          }
        />
        <Field label="Proposta" value={processo.proposal || "—"} />
        {processo.category && (
          <Field label="Categoria" value={processo.category} />
        )}
        {processo.nextActivity && (
          <Field label="Próxima atividade" value={processo.nextActivity} />
        )}
      </section>

      {/CANCELA/i.test(processo.process) && (
        <section className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Comunicar os setores</h2>
            <p className="text-xs text-gray-500">Enviado para geral@ ao registrar o cancelamento (quando marcado). Use o botão para enviar agora ou de novo.</p>
          </div>
          <form action={comunicarCancelamentoAction.bind(null, processo.id)}>
            <button type="submit" className="bg-brand-700 hover:bg-brand-900 text-white text-sm rounded px-3 py-1.5">Enviar comunicado</button>
          </form>
        </section>
      )}

      <ServicosTareffa itens={servTareffa} previstos={previstosTareffa} acao={criarServicosTareffaAction.bind(null, processo.id)} />

      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold">Atividades</h2>
          <p className="text-xs text-gray-500">
            {processo.activities.length} item(ns) · clique no dropdown para
            atualizar a situação
          </p>
        </div>
        <AtividadesTable
          processoId={processo.id}
          atividades={processo.activities}
          onUpdate={updateActivityAction}
            onObs={updateActivityObsAction}
        />
      </section>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase text-gray-500 tracking-wider mb-0.5">
        {label}
      </div>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}
