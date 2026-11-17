import { getCurrentUser } from "@/lib/societario/supabase-server";
import { ehDaTI } from "@/lib/tickets";
import { ehDiretoria } from "@/lib/acesso";

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

/** Ver a sprint (só leitura): T.I. ou Diretoria. Devolve o e-mail ou null. */
export async function podeVerSprint(): Promise<string | null> {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return null;
  return ehDiretoria(email) || (await ehDaTI(email)) ? email : null;
}
