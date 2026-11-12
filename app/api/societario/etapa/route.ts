import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { salvarEtapa, rotuloEtapa } from "@/lib/societario/etapaProcesso";

export const dynamic = "force-dynamic";

/** POST { id, texto } — grava a etapa atual do processo (texto vazio apaga). */
export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { id?: number; texto?: string };
  const id = Number(b.id);
  if (!id) return NextResponse.json({ error: "Processo inválido." }, { status: 400 });
  try {
    const e = await salvarEtapa(id, String(b.texto ?? ""), user.email);
    return NextResponse.json({ etapa: e, rotulo: rotuloEtapa(e) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
