// Cliente Supabase — usado tanto no servidor quanto no cliente.
// As funções "server only" usam a service role key (NUNCA exposta ao browser).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseConfigured(): boolean {
  return !!(URL && ANON);
}

let _public: SupabaseClient | null = null;
let _admin: SupabaseClient | null = null;

/** Cliente para leitura via anon key. Pode rodar no browser. */
export function supabasePublic(): SupabaseClient {
  if (!URL || !ANON) {
    throw new Error("Supabase URL/ANON_KEY não configurados");
  }
  if (!_public) {
    _public = createClient(URL, ANON, {
      auth: { persistSession: false },
    });
  }
  return _public;
}

/** Cliente admin com service role — APENAS no servidor. */
export function supabaseAdmin(): SupabaseClient {
  if (!URL || !SERVICE) {
    throw new Error("Supabase URL/SERVICE_ROLE_KEY não configurados");
  }
  if (typeof window !== "undefined") {
    throw new Error("supabaseAdmin() não pode rodar no browser");
  }
  if (!_admin) {
    _admin = createClient(URL, SERVICE, {
      auth: { persistSession: false },
    });
  }
  return _admin;
}
