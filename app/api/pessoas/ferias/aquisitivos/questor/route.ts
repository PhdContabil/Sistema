import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { papelDe, importarDoQuestor } from "@/lib/pessoas/ferias-programacao";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Importa do Questor (GET /rh/ferias-a-vencer) os períodos aquisitivos abertos da PHD. */
export async function POST() {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await importarDoQuestor(await papelDe(email))) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao importar." }, { status: 400 });
  }
}
