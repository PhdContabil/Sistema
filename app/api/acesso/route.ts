import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarModulo } from "@/lib/acesso";
import { MODULES } from "@/lib/modules";

export const dynamic = "force-dynamic";

/**
 * Nível de acesso da pessoa logada, pros módulos que ela pode ou não abrir —
 * usado pelo Launcher (tela inicial) pra mostrar o cadeado nos módulos fora
 * do setor dela, sem expor a query de ticket_users pro navegador.
 */
export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const bloqueados = MODULES.filter((m) => !podeAcessarModulo(nivel, m.id)).map((m) => m.id);
  return NextResponse.json({ acessoTotal: nivel.acessoTotal, bloqueados });
}
