// Decisão final sobre a experiência: só Julia Rodrigues e Junior registram.
import { NextResponse } from "next/server";
import { admin } from "@/lib/pessoas/ferias";
import { quemEstaAqui } from "@/lib/pessoas/datas-marcos-dados";
import { RECOMENDACOES } from "@/lib/pessoas/avaliacao-experiencia";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const q = await quemEstaAqui();
  if (!q.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!q.controle) return NextResponse.json({ error: "Só Julia Rodrigues e Junior registram a decisão." }, { status: 403 });
  let b: { id?: number; decisao?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!Number.isInteger(b.id) || !(String(b.decisao) in RECOMENDACOES)) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const sb = admin();
  if (!sb) return NextResponse.json({ error: "Banco indisponível." }, { status: 500 });
  const { data: av } = await sb.from("avaliacoes_experiencia").select("enviada_em").eq("id", b.id).maybeSingle();
  if (!av?.enviada_em) return NextResponse.json({ error: "Só dá para decidir depois que o encarregado responder." }, { status: 409 });
  const { error } = await sb.from("avaliacoes_experiencia")
    .update({ decisao: b.decisao, decisao_por: q.email, decisao_em: new Date().toISOString() }).eq("id", b.id);
  if (error) return NextResponse.json({ error: "Não consegui salvar." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
