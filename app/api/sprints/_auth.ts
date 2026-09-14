import { getCurrentUser } from "@/lib/societario/supabase-server";
import { ehDaTI } from "@/lib/tickets";

/**
 * A sprint é o planejamento do time de TI: quem não é do setor não cria,
 * não puxa cartão nem mexe no capacity dos outros. Devolve o e-mail quando
 * pode, ou null.
 */
export async function exigirTI(): Promise<string | null> {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return null;
  return (await ehDaTI(email)) ? email : null;
}
