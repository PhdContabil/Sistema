import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarModulo } from "@/lib/acesso";

/**
 * A DARE SP emite guia de imposto em nome do cliente: fica com quem tem o
 * módulo Fiscal. Devolve o e-mail quando pode, ou null.
 */
export async function exigirFiscal(): Promise<string | null> {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return null;
  const nivel = await obterNivelAcesso(email).catch(() => null);
  if (!nivel) return null;
  return podeAcessarModulo(nivel, "fiscal") ? email : null;
}
