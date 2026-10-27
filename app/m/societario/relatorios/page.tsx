import { loadAll } from "@/lib/societario/dataSource";
import { STATUS_PROCESSO, RESPONSAVEIS, canonicalResponsavel } from "@/lib/societario/options";
import { Relatorio, type ProcRel } from "@/components/societario/Relatorio";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const snap = await loadAll();
  const processos: ProcRel[] = snap.processos.map((p) => ({
    id: p.id,
    empresa: p.name,
    doc: p.inscription || "",
    tipo: p.process,
    tag: p.tag || "",
    status: (p.status || "").toUpperCase(),
    responsavel: canonicalResponsavel(p.bearer) || p.bearer || "",
    inicio: (p.started_in || "").slice(0, 10),
    encerrado: (p.closed_in || "").slice(0, 10),
    valor: p.value ?? null,
    atividades: (p.activities || []).map((a) => ({
      nome: a.name, responsavel: canonicalResponsavel(a.responsible) || a.responsible || "",
      coresp: canonicalResponsavel(a.co_responsible) || a.co_responsible || "",
      situacao: a.situation || "", prazo: (a.deadline_in || "").slice(0, 10), encerrada: (a.closed_in || "").slice(0, 10),
    })),
  }));
  const tipos = [...new Set(processos.map((p) => p.tipo))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const statusLista = [...new Set([...STATUS_PROCESSO, ...processos.map((p) => p.status)].filter(Boolean))];
  const responsaveis = [...new Set([...RESPONSAVEIS, ...processos.map((p) => p.responsavel)].filter(Boolean))];
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Relatórios para gestores</h1>
        <p className="text-sm text-gray-500">Escolha o período, os filtros e as informações; baixe em Excel ou gere o PDF.</p>
      </header>
      <Relatorio processos={processos} tipos={tipos} statusLista={statusLista} responsaveis={responsaveis} />
    </div>
  );
}
