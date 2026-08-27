"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SETORES, type SetorId } from "@/lib/tickets";

const SECTOR_COLORS: Record<string, string> = {
  contabil: "#d946ef",
  fiscal: "#06b6d4",
  trabalhista: "#3b82f6",
  financeiro: "#ef4444",
  paralegal: "#a855f7",
  ti: "#10b981",
  mei: "#f59e0b",
};

const ITEM =
  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition";
const ITEM_ON = "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium";
const ITEM_OFF =
  "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white";

export default function TicketsSidebar({
  resumo, souAdmin, souAdminGeral, meuSetor,
}: {
  resumo: Record<string, number>;
  souAdmin: boolean;
  /** Admin "pleno" (linha em ticket_admins) — só ele vê todos os setores. */
  souAdminGeral: boolean;
  /** Setor cadastrado da pessoa em ticket_users — o que ela enxerga quando não é admin. */
  meuSetor: string | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setorAtual: SetorId | null =
    pathname === "/m/tecnologia/tickets" ? ((searchParams.get("setor") as SetorId) || "contabil") : null;

  const setoresVisiveis = souAdminGeral ? SETORES : SETORES.filter((s) => s.id === meuSetor);

  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 dark:border-slate-800 p-4 text-slate-700 dark:text-slate-300">
      <div className="px-1 pb-3 mb-1 border-b border-slate-200 dark:border-slate-800">
        <div className="text-base font-bold text-slate-900 dark:text-white">Tickets</div>
      </div>

      <nav className="space-y-0.5">
        <div className="px-3 pt-3 pb-1.5 text-[11px] uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Setores
        </div>
        {setoresVisiveis.length === 0 && (
          <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500 italic">Sem setor cadastrado</div>
        )}
        {setoresVisiveis.map((s) => (
          <Link
            key={s.id}
            href={`/m/tecnologia/tickets?setor=${s.id}`}
            className={`${ITEM} ${setorAtual === s.id ? ITEM_ON : ITEM_OFF}`}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SECTOR_COLORS[s.id] }} />
            <span className="flex-1 truncate">{s.nome}</span>
            {resumo[s.id] ? <span className="text-xs text-slate-400 dark:text-slate-500">{resumo[s.id]}</span> : null}
          </Link>
        ))}

        {souAdmin && (
          <>
            <div className="px-3 pt-4 pb-1.5 text-[11px] uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Admin
            </div>
            <Link
              href="/m/tecnologia/tickets/dashboard"
              className={`${ITEM} ${pathname === "/m/tecnologia/tickets/dashboard" ? ITEM_ON : ITEM_OFF}`}
            >
              Dashboard
            </Link>
            <Link
              href="/m/tecnologia/tickets/usuarios"
              className={`${ITEM} ${pathname === "/m/tecnologia/tickets/usuarios" ? ITEM_ON : ITEM_OFF}`}
            >
              Usuários
            </Link>
            <Link
              href="/m/tecnologia/tickets/admins"
              className={`${ITEM} ${pathname === "/m/tecnologia/tickets/admins" ? ITEM_ON : ITEM_OFF}`}
            >
              Gerenciar admins
            </Link>
          </>
        )}
      </nav>
    </aside>
  );
}
