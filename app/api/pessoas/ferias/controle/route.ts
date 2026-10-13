import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { papelDe, listarControle } from "@/lib/pessoas/ferias-programacao";

export const dynamic = "force-dynamic";

/** Pessoas do alcance de quem pergunta, com períodos aquisitivos e programações. */
export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const papel = await papelDe(email);
  if (!papel.programa) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  return NextResponse.json({
    papel: { controle: papel.controle, todos: papel.todos, setor: papel.perfil?.setor ?? null },
    pessoas: await listarControle(papel),
  });
}
