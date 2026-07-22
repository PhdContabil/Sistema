// GET: lista todos os usuários autorizados.
// POST: cria um novo usuário.
// Acesso restrito a admins (validado pelo middleware + double-check aqui).

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { isAdmin } from "@/lib/societario/options";
import { listUsuarios, createUsuario } from "@/lib/societario/usuarios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureAdmin(): Promise<NextResponse | null> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json(
      { error: "Acesso restrito a administradores." },
      { status: 403 }
    );
  }
  return null;
}

export async function GET() {
  const denied = await ensureAdmin();
  if (denied) return denied;
  try {
    const usuarios = await listUsuarios();
    return NextResponse.json({ usuarios });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await ensureAdmin();
  if (denied) return denied;
  try {
    const body = await req.json();
    if (!body?.email || typeof body.email !== "string") {
      return NextResponse.json({ error: "Email é obrigatório" }, { status: 400 });
    }
    const usuario = await createUsuario({
      email: body.email,
      name: body.name ?? null,
      role: body.role === "admin" ? "admin" : "user",
      active: body.active ?? true,
    });
    return NextResponse.json({ usuario }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400 }
    );
  }
}
