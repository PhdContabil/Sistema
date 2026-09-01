import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { listarTicketsDashboard, ehAdminNav } from "@/lib/tickets";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email || !ehAdminNav(email)) {
    return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const tickets = await listarTicketsDashboard({
    busca: sp.get("busca") ?? undefined,
    setor: sp.get("setor") ?? undefined,
    status: sp.get("status") ?? undefined,
    responsavel: sp.get("responsavel") ?? undefined,
    criadoDe: sp.get("criadoDe") ?? undefined,
    criadoAte: sp.get("criadoAte") ?? undefined,
    finalizadoDe: sp.get("finalizadoDe") ?? undefined,
    finalizadoAte: sp.get("finalizadoAte") ?? undefined,
  });
  return NextResponse.json({ tickets });
}
