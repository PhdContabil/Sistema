import { NextResponse } from "next/server";
import { obterPessoa } from "@/lib/pessoas/dados";
import { getCurrentUser } from "@/lib/societario/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const perfil = await obterPessoa(params.slug);
  if (!perfil) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });

  // A pessoa só pode editar o próprio perfil (match por e-mail).
  let podeEditar = false;
  try {
    const user = await getCurrentUser();
    const email = user?.email?.toLowerCase();
    podeEditar = Boolean(email && perfil.email && perfil.email.toLowerCase() === email);
  } catch {
    podeEditar = false;
  }

  return NextResponse.json({ perfil, podeEditar });
}
