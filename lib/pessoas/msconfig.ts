// Credenciais do Microsoft Graph.
// Ordem de busca: variáveis de ambiente -> tabela app_config (service role).
import { createClient } from "@supabase/supabase-js";

export interface MsCreds { tenant: string; clientId: string; secret: string; origem: "env" | "banco" | "ausente"; }

let cache: { creds: MsCreds; em: number } | null = null;
const TTL = 5 * 60 * 1000;

export async function obterCredenciaisMS(): Promise<MsCreds> {
  const envTenant = process.env.MS_TENANT_ID;
  const envClient = process.env.MS_CLIENT_ID;
  const envSecret = process.env.MS_CLIENT_SECRET;
  if (envTenant && envClient && envSecret) {
    return { tenant: envTenant, clientId: envClient, secret: envSecret, origem: "env" };
  }

  if (cache && Date.now() - cache.em < TTL) return cache.creds;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svc) return { tenant: "", clientId: "", secret: "", origem: "ausente" };

  try {
    const sb = createClient(url, svc, { auth: { persistSession: false } });
    const { data } = await sb.from("app_config").select("chave,valor")
      .in("chave", ["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET"]);
    const m = new Map((data ?? []).map((r: { chave: string; valor: string }) => [r.chave, r.valor]));
    const creds: MsCreds = {
      tenant: m.get("MS_TENANT_ID") ?? "",
      clientId: m.get("MS_CLIENT_ID") ?? "",
      secret: m.get("MS_CLIENT_SECRET") ?? "",
      origem: "banco",
    };
    if (!creds.tenant || !creds.clientId || !creds.secret) {
      return { ...creds, origem: "ausente" };
    }
    cache = { creds, em: Date.now() };
    return creds;
  } catch {
    return { tenant: "", clientId: "", secret: "", origem: "ausente" };
  }
}

/** Token de aplicação do Graph (client credentials). */
export async function tokenGraph(c: MsCreds): Promise<string | null> {
  try {
    const r = await fetch(`https://login.microsoftonline.com/${c.tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: c.clientId, client_secret: c.secret,
        scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
      }),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.access_token ?? null;
  } catch {
    return null;
  }
}
