import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp, podeAcessarModulo } from "@/lib/acesso";

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

/**
 * DCTFWeb é compartilhada entre Fiscal e Trabalhista: mesmo controle, mesmos
 * dados. Libera quem acessa o app DCTFWeb em qualquer um dos dois módulos.
 */
export async function exigirDctfweb(): Promise<string | null> {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return null;
  const nivel = await obterNivelAcesso(email).catch(() => null);
  if (!nivel) return null;
  return podeAcessarApp(nivel, "fiscal", "DCTFWeb") || podeAcessarApp(nivel, "trabalhista", "DCTFWeb") ? email : null;
}
