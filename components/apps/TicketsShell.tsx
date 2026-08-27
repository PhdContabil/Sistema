import TicketsSidebar from "./TicketsSidebar";

/**
 * Painel único do sistema de Tickets: sidebar de setores/admin + conteúdo,
 * lado a lado dentro de UM contêiner — igual ao sistema antigo. Fica dentro
 * do cabeçalho do Núcleo Contábil (Workspace), nunca por fora dele.
 */
export default function TicketsShell({
  children, resumo, souAdmin, souAdminGeral, meuSetor,
}: {
  children: React.ReactNode;
  resumo: Record<string, number>;
  souAdmin: boolean;
  souAdminGeral: boolean;
  meuSetor: string | null;
}) {
  return (
    <div className="flex items-stretch bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      <TicketsSidebar resumo={resumo} souAdmin={souAdmin} souAdminGeral={souAdminGeral} meuSetor={meuSetor} />
      <div className="flex-1 min-w-0 p-5 md:p-6 text-slate-900 dark:text-slate-200">{children}</div>
    </div>
  );
}
