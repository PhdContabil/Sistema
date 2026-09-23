import Workspace from "@/components/Workspace";
import TicketsShell from "@/components/apps/TicketsShell";
import TicketsSprint from "@/components/apps/TicketsSprint";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import {
  ehAdminNav, ehAdminGeral, ehDaTI, obterSetorUsuario, resumoPorSetor, listarPessoas,
} from "@/lib/tickets";
import { listarSprints, sprintPadrao, podeDefinirEstimate } from "@/lib/sprints";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const user = await getCurrentUser().catch(() => null);
  const meuEmail = user?.email?.toLowerCase() ?? null;

  const [souAdminGeral, meuSetor, resumo, souDoTI] = await Promise.all([
    ehAdminGeral(meuEmail).catch(() => false),
    obterSetorUsuario(meuEmail).catch(() => null),
    resumoPorSetor().catch(() => ({}) as Record<string, number>),
    ehDaTI(meuEmail).catch(() => false),
  ]);

  let sprints: Awaited<ReturnType<typeof listarSprints>> = [];
  let atual = null;
  let pessoasTI: Awaited<ReturnType<typeof listarPessoas>> = [];
  let erro: string | null = null;

  // Quem não é do TI não recebe nem a lista: a tela já avisa e não há dado
  // nenhum trafegando à toa.
  if (souDoTI) {
    try {
      const [s, p, pessoas] = await Promise.all([listarSprints(), sprintPadrao(), listarPessoas()]);
      sprints = s;
      atual = p;
      pessoasTI = pessoas.filter((x) => x.sector === "ti");
    } catch (e) {
      erro = e instanceof Error ? e.message : "Falha ao carregar as sprints.";
    }
  }

  return (
    <Workspace moduleId="tecnologia" appName="Tickets · Sprint">
      <TicketsShell resumo={resumo} souAdmin={ehAdminNav(meuEmail)} souAdminGeral={souAdminGeral} meuSetor={meuSetor}>
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Sprint</h1>
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Planejamento do time de TI: capacidade por pessoa, cartões puxados do backlog das
            equipes e tempo real de execução.
          </div>
        </div>

        <TicketsSprint
          sprintInicial={atual}
          sprints={sprints}
          pessoasTI={pessoasTI}
          meuEmail={meuEmail}
          souDoTI={souDoTI}
          podeEstimar={podeDefinirEstimate(meuEmail)}
          erroServidor={erro}
        />
      </TicketsShell>
    </Workspace>
  );
}
