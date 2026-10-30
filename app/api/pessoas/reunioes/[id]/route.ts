import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { admin } from "@/lib/pessoas/ferias";
import { lerReunioes, salvarReunioes, podeAgendar } from "@/lib/pessoas/reunioes";

export const dynamic = "force-dynamic";

/** Remove uma reunião da agenda. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await podeAgendar(email)).ok) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const lista = await lerReunioes();
  const id = Number(params.id);
  if (!lista.some((x) => x.id === id)) return NextResponse.json({ error: "Reunião não encontrada." }, { status: 404 });
  const erro = await salvarReunioes(lista.filter((x) => x.id !== id));
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });
  try { await admin()?.from("eventos_agenda").delete().eq("origem", `reuniao:${id}`); } catch { /* segue */ }
  return NextResponse.json({ ok: true });
}
