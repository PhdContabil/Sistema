import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso } from "@/lib/acesso";
import { lerTermos, salvarTermos } from "@/lib/inventario-termos";

export const dynamic = "force-dynamic";

/** Cancela um termo pendente ou registra a devolução do equipamento. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser().catch(() => null);
  if (!(await obterNivelAcesso(user?.email)).acessoTotal) return NextResponse.json({ error: "Apenas T.I./Diretoria." }, { status: 403 });
  let b: { acao?: string; obs?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const lista = await lerTermos();
  const t = lista.find((x) => x.id === Number(params.id));
  if (!t) return NextResponse.json({ error: "Termo não encontrado." }, { status: 404 });
  if (b.acao === "cancelar") {
    if (t.status !== "pendente") return NextResponse.json({ error: "Só dá para cancelar termo ainda não assinado." }, { status: 409 });
    t.status = "cancelado";
  } else if (b.acao === "devolver") {
    if (t.status !== "assinado") return NextResponse.json({ error: "Só dá para registrar devolução de termo assinado." }, { status: 409 });
    t.status = "devolvido";
    t.devolvido_em = new Date().toISOString();
    t.devolucao_obs = String(b.obs ?? "").trim().slice(0, 500) || null;
  } else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  const erro = await salvarTermos(lista);
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });
  return NextResponse.json({ ok: true, status: t.status });
}
