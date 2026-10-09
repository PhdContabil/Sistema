import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";

/** Nome do app em lib/modules.ts — é a chave dos overrides de permissão. */
export const APP_INFORME = "Sistema Contábil";

/**
 * O informe grava no fiscal do cliente: fica com quem tem o módulo Contábil
 * (ou liberação individual do app). Devolve o e-mail quando pode, ou null.
 */
export async function exigirContabil(): Promise<string | null> {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return null;
  const nivel = await obterNivelAcesso(email).catch(() => null);
  if (!nivel) return null;
  return podeAcessarApp(nivel, "contabil", APP_INFORME) ? email : null;
}
