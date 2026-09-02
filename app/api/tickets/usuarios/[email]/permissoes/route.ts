import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso } from "@/lib/acesso";
import {
  listarPermissoesPessoa,
  salvarPermissoesPessoa,
  type NivelPermissao,
} from "@/lib/tickets";

export const dynamic = "force-dynamic";

async function souAutorizado() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return nivel.acessoTotal;
}

export async function GET(_req: Request, { params }: { params: { email: string } }) {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Apenas T.I. e Diretoria." }, { status: 403 });
  const overrides = await listarPermissoesPessoa(decodeURIComponent(params.email));
  return NextResponse.json({ overrides });
}

export async function PUT(req: Request, { params }: { params: { email: string } }) {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Apenas T.I. e Diretoria." }, { status: 403 });

  let body: {
    modulos?: Record<string, NivelPermissao>;
    apps?: Record<string, Record<string, NivelPermissao>>;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  const erro = await salvarPermissoesPessoa(decodeURIComponent(params.email), {
    modulos: body.modulos ?? {},
    apps: body.apps ?? {},
  });
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
