// PUT: atualiza usuário.
// DELETE: remove usuário.
// Acesso restrito a admins.

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { isAdmin, ADMIN_EMAILS } from "@/lib/societario/options";
import { updateUsuario, deleteUsuario, listUsuarios } from "@/lib/societario/usuarios";

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

/** Não deixa apagar / desativar o último admin hardcoded da tabela. */
async function isProtectedHardcodedAdmin(targetId: number): Promise<boolean> {
  const all = await listUsuarios();
  const target = all.find((u) => u.id === targetId);
  if (!target) return false;
  return ADMIN_EMAILS.some(
    (e) => e.toLowerCase() === target.email.toLowerCase()
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = await ensureAdmin();
  if (denied) return denied;
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const body = await req.json();

    // Não deixa desativar / mudar role do admin hardcoded
    if (await isProtectedHardcodedAdmin(id)) {
      if (body.active === false) {
        return NextResponse.json(
          { error: "Não é possível desativar o administrador principal." },
          { status: 400 }
        );
      }
      if (body.role && body.role !== "admin") {
        return NextResponse.json(
          { error: "Não é possível remover o papel de admin do administrador principal." },
          { status: 400 }
        );
      }
    }

    const usuario = await updateUsuario(id, {
      email: body.email,
      name: body.name,
      role: body.role,
      active: body.active,
    });
    if (!usuario) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ usuario });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = await ensureAdmin();
  if (denied) return denied;
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    if (await isProtectedHardcodedAdmin(id)) {
      return NextResponse.json(
        { error: "Não é possível remover o administrador principal." },
        { status: 400 }
      );
    }
    await deleteUsuario(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
