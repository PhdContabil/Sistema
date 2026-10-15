import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { papelDe } from "@/lib/pessoas/ferias-programacao";
import { enviarFeriasAoQuestor } from "@/lib/pessoas/ferias-questor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** (Re)envia ao Questor a programação de férias de uma solicitação aprovada. */
export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const papel = await papelDe(email);
  if (!papel.programa) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  let b: { solicitacao_id?: number };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!b.solicitacao_id) return NextResponse.json({ error: "Informe a solicitação." }, { status: 400 });
  return NextResponse.json(await enviarFeriasAoQuestor(Number(b.solicitacao_id), email));
}
