import Workspace from "@/components/Workspace";
import TicketsBoard from "@/components/apps/TicketsBoard";
import { getModule } from "@/lib/modules";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import {
  listarTickets, resumoPorSetor, ehSetor, ticketsDb,
  listarPessoas, podeEditarMedicao,
  type Ticket, type SetorId, type PessoaTickets,
} from "@/lib/tickets";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: { setor?: string; finalizados?: string };
}) {
  const m = getModule("tecnologia")!;

  const setor: SetorId = ehSetor(searchParams?.setor) ? searchParams.setor : "contabil";
  const incluirFinalizados = searchParams?.finalizados === "1";

  let tickets: Ticket[] = [];
  let resumo: Record<string, number> = {};
  let pessoas: PessoaTickets[] = [];
  let erro: string | null = null;

  if (!ticketsDb()) {
    erro = "Banco não configurado no servidor (SUPABASE_SERVICE_ROLE_KEY ausente).";
  } else {
    try {
      [tickets, resumo, pessoas] = await Promise.all([
        listarTickets(setor, incluirFinalizados),
        resumoPorSetor(),
        listarPessoas(),
      ]);
    } catch (e) {
      erro = e instanceof Error ? e.message : "Falha ao consultar os tickets.";
    }
  }

  const user = await getCurrentUser().catch(() => null);
  const meuEmail = user?.email?.toLowerCase() ?? null;
  const souAdmin = await podeEditarMedicao(meuEmail).catch(() => false);

  return (
    <Workspace moduleId="tecnologia" appName="Tickets">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>TK</div>
        <div>
          <h1>Tickets</h1>
          <div className="desc">Chamados de cada setor, do backlog à finalização.</div>
        </div>
      </div>
      <TicketsBoard
        setor={setor}
        tickets={tickets}
        resumo={resumo}
        incluirFinalizados={incluirFinalizados}
        meuEmail={meuEmail}
        pessoas={pessoas}
        souAdmin={souAdmin}
        erroServidor={erro}
      />
    </Workspace>
  );
}
