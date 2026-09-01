import Link from "next/link";
import { computeStats, loadAll } from "@/lib/societario/dataSource";
import { StatusPill } from "@/components/societario/StatusPill";
import { formatDate } from "@/lib/societario/tareffa";
import { StatusDonut } from "@/components/societario/charts/StatusDonut";
import { ResponsaveisRanking } from "@/components/societario/charts/ResponsaveisRanking";
import { TimelineChart } from "@/components/societario/charts/TimelineChart";
import { TipoBarsChart } from "@/components/societario/charts/TipoBarsChart";
import { AtividadeRecente } from "@/components/societario/AtividadeRecente";
import { SyncButton } from "@/components/societario/SyncButton";
import { getCurrentUser } from "@/lib/societario/supabase-server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [snap, user] = await Promise.all([loadAll(), getCurrentUser()]);
  const stats = computeStats(snap.processos);
  const firstName = (user?.user_metadata?.full_name as string | undefined)
    ?.split(" ")[0];

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {firstName ? `Olá, ${firstName}` : "Dashboard"}
          </h1>
          <p className="text-sm text-gray-500">
            Visão geral de todos os processos societários.
          </p>
        </div>
        <SyncButton windows={2} />
      </header>

      {snap.apiError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
          <strong>Erro ao consultar a base:</strong> {snap.apiError}
        </div>
      )}

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card
          icon="📋"
          label="Total processos"
          value={stats.total}
          href="/m/societario/processos"
        />
        <Card
          icon="🏢"
          label="Empresas únicas"
          value={stats.empresasUnicas}
          href="/m/societario/empresas"
        />
        <Card
          icon="⏳"
          label="Em aberto"
          value={stats.emAberto}
          tone="blue"
          href="/m/societario/processos?status=ACOMPANHAMENTO"
        />
        <Card
          icon="⏸️"
          label="Pendentes"
          value={stats.pendente}
          tone="amber"
          href="/m/societario/processos?status=AGUARDANDO+CLIENTE"
        />
        <Card
          icon="✅"
          label="Concluídos"
          value={stats.concluido}
          tone="green"
          href="/m/societario/processos?status=CONCLU%C3%8DDO"
        />
        <Card
          icon="🚫"
          label="Cancelados"
          value={stats.cancelado}
          tone="gray"
          href="/m/societario/processos?status=CANCELADO"
        />
      </section>

      <section>
        <AtividadeRecente
          processos={snap.processos.map((p) => ({
            started_in: p.started_in,
            updated_in: p.updated_in,
            process: p.process,
            bearer: p.bearer,
            status: p.status,
          }))}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StatusDonut data={stats.porStatus.slice(0, 9)} />
        <TipoBarsChart data={stats.porTipo.slice(0, 8)} />
      </section>

      <section>
        <TimelineChart mes={stats.porMes} semana={stats.porSemana} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ResponsaveisRanking data={stats.porResponsavel} />

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Últimos processos atualizados</h3>
            <Link
              href="/m/societario/processos"
              className="text-sm text-brand-700 hover:underline"
            >
              Ver todos →
            </Link>
          </div>
          {stats.recentes.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nenhum processo encontrado.
            </p>
          ) : (
            <ul className="divide-y">
              {stats.recentes.map((p) => (
                <li key={p.id} className="py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/m/societario/processos/${p.id}`}
                      className="font-medium text-sm hover:underline truncate block"
                    >
                      {p.name}
                    </Link>
                    <div className="text-xs text-gray-500 truncate">
                      {p.process} · {formatDate(p.updated_in)}
                    </div>
                  </div>
                  <StatusPill status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Card({
  icon,
  label,
  value,
  tone,
  href,
}: {
  icon: string;
  label: string;
  value: number;
  tone?: "amber" | "green" | "blue" | "gray";
  href: string;
}) {
  const valueClass =
    tone === "amber"
      ? "text-amber-600"
      : tone === "green"
      ? "text-emerald-600"
      : tone === "blue"
      ? "text-blue-600"
      : tone === "gray"
      ? "text-gray-500"
      : "text-gray-900";
  return (
    <Link
      href={href}
      className="soc-stat bg-white border border-gray-200 rounded-lg p-4 block hover:border-brand-500 hover:shadow-md transition group"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xl" aria-hidden>
          {icon}
        </span>
      </div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">
        {label}
      </div>
      <div className={`text-2xl font-bold ${valueClass}`}>
        {value.toLocaleString("pt-BR")}
      </div>
    </Link>
  );
}
