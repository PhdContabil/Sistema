import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { iniciarExecucao, pararExecucao, execucaoAberta } from "@/lib/sprints";

export const dynamic = "force-dynamic";

/**
 * Cronômetro. Diferente do resto da sprint, NÃO exige ser do TI: quem executa
 * a tarefa é quem marca o próprio tempo, e a execução é sempre em nome de quem
 * está logado — o corpo não escolhe o e-mail.
 */
export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json({ aberta: await execucaoAberta(email) });
}

export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: { acao?: string; ticket_id?: string; sprint_id?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  if (body.acao === "parar") {
    const erro = await pararExecucao(email);
    if (erro) return NextResponse.json({ error: erro }, { status: 500 });
    return NextResponse.json({ ok: true, aberta: null });
  }

  if (body.acao === "iniciar") {
    if (!body.ticket_id) return NextResponse.json({ error: "Cartão não informado." }, { status: 400 });
    const erro = await iniciarExecucao(body.ticket_id, body.sprint_id ?? null, email);
    if (erro) return NextResponse.json({ error: erro }, { status: 500 });
    return NextResponse.json({ ok: true, aberta: await execucaoAberta(email) });
  }

  return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
}
