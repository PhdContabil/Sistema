// CRUD de usuários autorizados.
// Source of truth: tabela `usuarios_autorizados` no Supabase.

import { supabaseAdmin } from "./supabase";
import type { UserRole } from "./options";

export type UsuarioRole = UserRole; // alias compat ("dev" | "admin" | "user")

export interface Usuario {
  id: number;
  email: string;
  name: string | null;
  role: UsuarioRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UsuarioInput {
  email: string;
  name?: string | null;
  role?: UsuarioRole;
  active?: boolean;
}

function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

function normalizeRole(r: unknown): UsuarioRole {
  if (r === "dev") return "dev";
  if (r === "admin") return "admin";
  return "user";
}

interface UsuarioRow {
  id: number;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function rowToUsuario(r: UsuarioRow): Usuario {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: normalizeRole(r.role),
    active: r.active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function listUsuarios(): Promise<Usuario[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("usuarios_autorizados")
    .select("*")
    .order("active", { ascending: false })
    .order("role", { ascending: true })
    .order("email", { ascending: true });
  if (error) throw new Error(`List usuarios: ${error.message}`);
  return ((data || []) as UsuarioRow[]).map(rowToUsuario);
}

export async function isEmailAllowedDB(
  email: string | null | undefined
): Promise<boolean> {
  if (!email) return false;
  const lower = normalizeEmail(email);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("usuarios_autorizados")
    .select("id, active")
    .eq("email", lower)
    .maybeSingle();
  if (error) return false;
  return !!(data && data.active);
}

export async function createUsuario(input: UsuarioInput): Promise<Usuario> {
  if (!input.email) throw new Error("Email obrigatório");
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("usuarios_autorizados")
    .insert({
      email: normalizeEmail(input.email),
      name: input.name?.trim() || null,
      role: normalizeRole(input.role),
      active: input.active ?? true,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error("Já existe um usuário com esse email");
    }
    throw new Error(`Create usuario: ${error.message}`);
  }
  return rowToUsuario(data as UsuarioRow);
}

export async function updateUsuario(
  id: number,
  patch: Partial<UsuarioInput>
): Promise<Usuario | null> {
  const sb = supabaseAdmin();
  const update: Record<string, unknown> = {};
  if (patch.email !== undefined) update.email = normalizeEmail(patch.email);
  if (patch.name !== undefined) update.name = patch.name?.trim() || null;
  if (patch.role !== undefined) update.role = normalizeRole(patch.role);
  if (patch.active !== undefined) update.active = patch.active;

  const { data, error } = await sb
    .from("usuarios_autorizados")
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      throw new Error("Já existe um usuário com esse email");
    }
    throw new Error(`Update usuario: ${error.message}`);
  }
  return data ? rowToUsuario(data as UsuarioRow) : null;
}

export async function deleteUsuario(id: number): Promise<boolean> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("usuarios_autorizados")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`Delete usuario: ${error.message}`);
  return true;
}
