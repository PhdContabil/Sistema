import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso } from "@/lib/acesso";
import { listarPerfisAdmin, atualizarPerfilAdmin, criarPerfilAdmin } from "@/lib/pessoas/dados";

// Usado só pela tela "Usuários por setor" (/m/tecnologia/usuarios), pra
// mostrar se cada pessoa de ticket_users já tem um perfil vinculado em
// Pessoas (por e-mail) e corrigir/criar quando não tem. Mesmo nível de
// acesso da própria tela: só T.I./Diretoria (acessoTotal).

export const dynamic = "force-dynamic";

async function souAdmin() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return nivel.acessoTotal;
}

/** Lista crua de perfis (id, slug, nome, email, setor) — o casamento com
 * ticket_users é feito no cliente, que já tem a lista de usuários carregada. */
export async function GET() {
  if (!(await souAdmin())) return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  return NextResponse.json({ perfis: await listarPerfisAdmin() });
}

/**
 * Corrige o e-mail (e opcionalmente o setor) de um perfil existente — passe
 * `id`. Sem `id`, cria um perfil novo com `nome`/`email`/`setor`/`funcao`.
 */
export async function POST(req: Request) {
  if (!(await souAdmin())) return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });

  let body: { id?: number; nome?: string; email?: string; setor?: string; funcao?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  const email = (body.email ?? "").trim();
  if (!email) return NextResponse.json({ error: "E-mail é obrigatório." }, { status: 400 });

  let erro: string | null;
  if (body.id) {
    erro = await atualizarPerfilAdmin(body.id, email, body.setor);
  } else {
    const nome = (body.nome ?? "").trim();
    const setor = (body.setor ?? "").trim();
    if (!nome || !setor) return NextResponse.json({ error: "Nome e setor são obrigatórios pra criar." }, { status: 400 });
    erro = await criarPerfilAdmin({ nome, email, setor, funcao: body.funcao });
  }

  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
