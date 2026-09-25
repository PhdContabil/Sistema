// Credenciais do Microsoft Graph usadas pelo Paralegal System migrado.
//
// Este é um app Azure DIFERENTE do usado pelo Robô Zen (lib/pessoas/msconfig.ts):
// aquele só tem leitura (Sites.Read.All); este precisa de escrita nas listas do
// SharePoint (Sites.ReadWrite.All) e de Mail.Send, porque o sistema antigo grava
// Clientes/Contratos/OS/Indicações/Roteiro de Troca como itens de lista e manda
// e-mail de OS pelo Graph. Por isso variáveis de ambiente com nomes distintos —
// não misturar com MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET do Robô Zen.
//
// Ordem de busca: variáveis de ambiente -> tabela app_config (service role),
// mesmo padrão do resto do Núcleo.
import { createClient } from "@supabase/supabase-js";

export interface MsCreds { tenant: string; clientId: string; secret: string; origem: "env" | "banco" | "ausente"; }

let cache: { creds: MsCreds; em: number } | null = null;
const TTL = 5 * 60 * 1000;

export async function obterCredenciaisParalegalMS(): Promise<MsCreds> {
  const envTenant = process.env.PARALEGAL_MS_TENANT_ID;
  const envClient = process.env.PARALEGAL_MS_CLIENT_ID;
  const envSecret = process.env.PARALEGAL_MS_CLIENT_SECRET;
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
      .in("chave", ["PARALEGAL_MS_TENANT_ID", "PARALEGAL_MS_CLIENT_ID", "PARALEGAL_MS_CLIENT_SECRET"]);
    const m = new Map((data ?? []).map((r: { chave: string; valor: string }) => [r.chave, r.valor]));
    const creds: MsCreds = {
      tenant: m.get("PARALEGAL_MS_TENANT_ID") ?? "",
      clientId: m.get("PARALEGAL_MS_CLIENT_ID") ?? "",
      secret: m.get("PARALEGAL_MS_CLIENT_SECRET") ?? "",
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

/** Token de aplicação do Graph (client credentials) — mesmo endpoint, credencial própria. */
export async function tokenParalegalGraph(c: MsCreds): Promise<string | null> {
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
