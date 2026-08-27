// Acesso aos perfis de Pessoas (Supabase). Server-side.
import { createClient } from "@supabase/supabase-js";

export interface Formacao {
  id: number; curso: string; grau: string | null; instituicao: string | null;
  inicio: number | null; fim: number | null;
}
export interface CursoEvento {
  id: number; tipo: string; titulo: string; instituicao: string | null;
  participacao: string | null; competencia: string | null;
}
export interface Perfil {
  id: number; slug: string; nome: string; tratamento: string | null;
  cargo: string | null; setor: string; funcao: string | null;
  email: string | null; foto_url: string | null;
  historico: string | null; espaco_cultural: string | null;
  transporte: string | null;
  modelo: boolean;
  formacoes?: Formacao[];
  cursos?: CursoEvento[];
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Lista todos os perfis ativos, em ordem alfabética. */
export async function listarPessoas(): Promise<Perfil[]> {
  const sb = client();
  if (!sb) return [];
  const { data, error } = await sb
    .from("pessoas_perfil")
    .select("id,slug,nome,tratamento,cargo,setor,funcao,email,foto_url,historico,espaco_cultural,modelo,transporte")
    .eq("ativo", true)
    .order("nome");
  if (error || !data) return [];
  return (data as Perfil[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Perfil completo (com formações e cursos). */
export async function obterPessoa(slug: string): Promise<Perfil | null> {
  const sb = client();
  if (!sb) return null;
  const { data: p } = await sb
    .from("pessoas_perfil")
    .select("id,slug,nome,tratamento,cargo,setor,funcao,email,foto_url,historico,espaco_cultural,modelo,transporte")
    .eq("slug", slug)
    .maybeSingle();
  if (!p) return null;

  const perfil = p as Perfil;
  const [{ data: fs }, { data: cs }] = await Promise.all([
    sb.from("pessoas_formacao").select("id,curso,grau,instituicao,inicio,fim").eq("pessoa_id", perfil.id).order("fim", { ascending: false, nullsFirst: true }),
    sb.from("pessoas_cursos").select("id,tipo,titulo,instituicao,participacao,competencia").eq("pessoa_id", perfil.id).order("competencia", { ascending: false }),
  ]);
  perfil.formacoes = (fs ?? []) as Formacao[];
  perfil.cursos = (cs ?? []) as CursoEvento[];
  return perfil;
}

export function iniciaisDe(nome: string): string {
  const w = nome.replace(/^(Sra?\.)\s*/i, "").trim().split(/\s+/);
  return ((w[0]?.[0] || "") + (w[1]?.[0] || "")).toUpperCase();
}

export function periodoFormacao(f: Formacao): string {
  if (f.inicio && f.fim) return `${f.inicio}–${f.fim}`;
  if (f.inicio) return `${f.inicio}–atual`;
  return "";
}

export function competenciaBR(iso: string | null): string {
  if (!iso) return "";
  const [a, m] = iso.split("-");
  return `${m}/${a}`;
}
