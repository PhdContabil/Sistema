// Acesso ao Sistema MEI: submódulo restrito à T.I. (ver apenasTI em lib/modules.ts).
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";

export const APP_SISTEMA_MEI = "Sistema MEI";

/** Devolve uma resposta 403 se o usuário não pode usar o Sistema MEI; senão null. */
export async function bloquearSemAcessoMei(): Promise<NextResponse | null> {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  if (!podeAcessarApp(nivel, "mei", APP_SISTEMA_MEI)) {
    return NextResponse.json({ error: "Sistema MEI restrito à T.I." }, { status: 403 });
  }
  return null;
}
