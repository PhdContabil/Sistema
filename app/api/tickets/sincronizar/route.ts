import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { ehAdminGeral, sincronizarTicketsOrigem } from "@/lib/tickets";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email || !(await ehAdminGeral(email))) {
    return NextResponse.json({ erro: "Apenas administradores." }, { status: 403 });
  }

  const resultado = await sincronizarTicketsOrigem();
  return NextResponse.json(resultado);
}
