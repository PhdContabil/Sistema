// Prévia do aviso de Bem-Estar: envia SÓ para o e-mail de quem está logado.
// Abrir no navegador: /api/pessoas/avisos-bem-estar/previa?evento=ID
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { enviarPreviaBemEstar } from "@/lib/pessoas/avisos-bem-estar";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("evento"));
  if (!id) return NextResponse.json({ error: "Informe ?evento=ID." }, { status: 400 });
  try {
    const r = await enviarPreviaBemEstar(id, email);
    return NextResponse.json({
      ok: r.email,
      mensagem: r.email ? `Prévia de "${r.evento}" enviada para ${r.para}. Confira a caixa de entrada.` : "O e-mail não saiu; veja notificacoes_log.",
      teams: r.teams,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status: 500 });
  }
}
