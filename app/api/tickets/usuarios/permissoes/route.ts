import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso } from "@/lib/acesso";
import { listarPermissoesTodos } from "@/lib/tickets";

export const dynamic = "force-dynamic";

/** Permissões personalizadas de todos os usuários (uma chamada em vez de uma por pessoa). */
export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  if (!(await obterNivelAcesso(user?.email)).acessoTotal) return NextResponse.json({ error: "Apenas T.I. e Diretoria." }, { status: 403 });
  return NextResponse.json({ porEmail: await listarPermissoesTodos() });
}