import Workspace from "@/components/Workspace";
import TicketsBoard from "@/components/apps/TicketsBoard";
import TicketsShell from "@/components/apps/TicketsShell";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import {
  listarTickets, ehSetor, ticketsDb,
  listarPessoas, podeEditarMedicao, ehAdminGeral, obterSetorUsuario, resumoPorSetor,
  type Ticket, type SetorId, type PessoaTickets,
} from "@/lib/tickets";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: { setor?: string };
}) {
  const user = await getCurrentUser().catch(() => null);
  const meuEmail = user?.email?.toLowerCase() ?? null;
  const [souAdmin, souAdminGeral, meuSetor, resumo] = await Promise.all([
    podeEditarMedicao(meuEmail).catch(() => false),
    ehAdminGeral(meuEmail).catch(() => false),
    obterSetorUsuario(meuEmail).catch(() => null),
    resumoPorSetor().catch(() => ({}) as Record<string, number>),
  ]);

  const setorPedido: SetorId = ehSetor(searchParams?.setor) ? searchParams.setor : "contabil";
  // Quem não é admin pleno só enxerga o próprio setor — ignora o que vier na
  // URL, senão bastaria trocar o parâmetro pra ver tickets de outro setor.
  const setor: SetorId | null = souAdminGeral ? setorPedido : meuSetor;

  let tickets: Ticket[] = [];
  let pessoas: PessoaTickets[] = [];
  let erro: string | null = null;

  if (!setor) {
    erro = "Você ainda não está cadastrado em nenhum setor de Tickets. Peça a um administrador para te cadastrar em Usuários.";
  } else if (!ticketsDb()) {
    erro = "Banco não configurado no servidor (SUPABASE_SERVICE_ROLE_KEY ausente).";
  } else {
    try {
      // Sempre inclui finalizados — a coluna Finalizado do board fica sempre visível.
      [tickets, pessoas] = await Promise.all([
        listarTickets(setor, true),
        listarPessoas(),
      ]);
    } catch (e) {
      erro = e instanceof Error ? e.message : "Falha ao consultar os tickets.";
    }
  }

  return (
    <Workspace moduleId="tecnologia" appName="Tickets">
      <TicketsShell resumo={resumo} souAdmin={souAdmin} souAdminGeral={souAdminGeral} meuSetor={meuSetor}>
        <TicketsBoard
          setor={setor ?? "contabil"}
          tickets={tickets}
          meuEmail={meuEmail}
          pessoas={pessoas}
          souAdmin={souAdmin}
          souAdminGeral={souAdminGeral}
          erroServidor={erro}
        />
      </TicketsShell>
    </Workspace>
  );
}
