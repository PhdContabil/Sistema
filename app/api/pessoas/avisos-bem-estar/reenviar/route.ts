// Reenvia o e-mail de um evento de Bem-Estar só para quem ficou sem ele.
// Abrir logado: /api/pessoas/avisos-bem-estar/reenviar?evento=ID
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { reenviarFalhasBemEstar } from "@/lib/pessoas/avisos-bem-estar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("evento"));
  if (!id) return NextResponse.json({ error: "Informe ?evento=ID." }, { status: 400 });
  try {
    const r = await reenviarFalhasBemEstar(id);
    return NextResponse.json({ ok: r.falharam.length === 0, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status: 500 });
  }
}
