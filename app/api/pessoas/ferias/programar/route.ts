import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { papelDe, programarFerias } from "@/lib/pessoas/ferias-programacao";
import type { PeriodoFerias } from "@/lib/pessoas/ferias";

export const dynamic = "force-dynamic";

/** Líder do setor (ou controle de férias) programa as férias já combinadas. */
export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  let b: { pessoa_id?: number; periodos?: PeriodoFerias[]; observacao?: string; aquisitivo_id?: number | null };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!b.pessoa_id) return NextResponse.json({ error: "Escolha a pessoa." }, { status: 400 });
  const r = await programarFerias(await papelDe(email), {
    pessoa_id: Number(b.pessoa_id), periodos: b.periodos ?? [], observacao: b.observacao, aquisitivo_id: b.aquisitivo_id ?? null,
  });
  if (r.erro) return NextResponse.json({ error: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true, questor: r.questor });
}
