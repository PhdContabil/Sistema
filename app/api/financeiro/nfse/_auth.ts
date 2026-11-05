import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarModulo } from "@/lib/acesso";

/** Emissão de NFS-e da PHD: quem tem o módulo Financeiro. Devolve o e-mail ou null. */
export async function exigirFinanceiro(): Promise<string | null> {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return null;
  const nivel = await obterNivelAcesso(email).catch(() => null);
  if (!nivel) return null;
  return podeAcessarModulo(nivel, "financeiro") ? email : null;
}
