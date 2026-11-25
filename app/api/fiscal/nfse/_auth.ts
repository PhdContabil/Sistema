import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";

/** Fiscal › Notas Fiscais: quem acessa o módulo Fiscal. Devolve o e-mail ou null. */
export async function exigirFiscal(): Promise<string | null> {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return null;
  const nivel = await obterNivelAcesso(email).catch(() => null);
  return nivel && podeAcessarApp(nivel, "fiscal", "Notas Fiscais") ? email : null;
}
