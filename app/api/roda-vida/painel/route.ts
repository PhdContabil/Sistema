import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { painelDiretoria, ehDiretoria } from "@/lib/roda-vida";

export const dynamic = "force-dynamic";

/** Visão da diretoria. Fora dela, nem a lista de quem respondeu sai daqui. */
export async function GET() {
  const u = await getCurrentUser().catch(() => null);
  const email = u?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!ehDiretoria(email)) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });

  return NextResponse.json({ linhas: await painelDiretoria() });
}
