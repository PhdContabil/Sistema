import Link from "next/link";
import Workspace from "@/components/Workspace";
import TicketsDashboard from "@/components/apps/TicketsDashboard";
import TicketsShell from "@/components/apps/TicketsShell";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { podeEditarMedicao, ehAdminGeral, obterSetorUsuario, resumoPorSetor } from "@/lib/tickets";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser().catch(() => null);
  const meuEmail = user?.email?.toLowerCase() ?? null;
  const [souAdmin, souAdminGeral, meuSetor, resumo] = await Promise.all([
    podeEditarMedicao(meuEmail).catch(() => false),
    ehAdminGeral(meuEmail).catch(() => false),
    obterSetorUsuario(meuEmail).catch(() => null),
    resumoPorSetor().catch(() => ({}) as Record<string, number>),
  ]);

  return (
    <Workspace moduleId="tecnologia" appName="Tickets · Dashboard">
      <TicketsShell resumo={resumo} souAdmin={souAdmin} souAdminGeral={souAdminGeral} meuSetor={meuSetor}>
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">Log completo de tickets com filtros — sem gráficos.</div>
        </div>
        {!souAdmin ? (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 text-sm rounded-lg px-4 py-3">
            Só administradores acessam esta tela.{" "}
            <Link href="/m/tecnologia/tickets" className="underline hover:text-red-900 dark:hover:text-white">Voltar para os tickets</Link>
          </div>
        ) : (
          <TicketsDashboard />
        )}
      </TicketsShell>
    </Workspace>
  );
}
