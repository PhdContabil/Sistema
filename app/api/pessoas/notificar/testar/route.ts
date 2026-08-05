import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { enviarEmail, avisarTeamsFluxo, avisarCanal, layoutEmail } from "@/lib/pessoas/notificar";

export const dynamic = "force-dynamic";
const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://system-contabilidade.vercel.app";

/**
 * Testa os canais de notificação enviando para o PRÓPRIO usuário logado.
 * Uso: abra /api/pessoas/notificar/testar no navegador, já autenticado.
 */
export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Entre no sistema primeiro." }, { status: 401 });

  const link = `${BASE}/m/pessoas/ferias`;

  const emailOk = await enviarEmail(
    email,
    "Teste de notificação — Núcleo Contábil",
    layoutEmail(
      "Teste de notificação",
      "<p>Se você recebeu este e-mail, o canal de <strong>e-mail</strong> está funcionando.</p>",
      { texto: "Abrir Férias", url: link }
    )
  );

  const teamsOk = await avisarTeamsFluxo(
    email,
    "Teste de notificação",
    "Se você recebeu esta mensagem no Teams, o fluxo do Power Automate está funcionando.",
    link
  );

  const canalOk = await avisarCanal(`🔔 Teste de notificação do Núcleo Contábil (solicitado por ${email}).`);

  return NextResponse.json({
    destino: email,
    email: emailOk ? "enviado" : "falhou (ver notificacoes_log)",
    teams_privado: teamsOk ? "enviado via Power Automate" : "não configurado (defina POWER_AUTOMATE_URL)",
    canal_teams: canalOk ? "enviado" : "não configurado (defina TEAMS_WEBHOOK_URL)",
  });
}
