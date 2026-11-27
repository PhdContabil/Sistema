// Controle das lembrancinhas de tempo de casa: só Julia Rodrigues e Junior marcam.
import { NextResponse } from "next/server";
import { admin } from "@/lib/pessoas/ferias";
import { quemEstaAqui } from "@/lib/pessoas/datas-marcos-dados";

export const dynamic = "force-dynamic";

/** Marca ou desmarca "feita" / "entregue". Entregue marca feita junto; desmarcar feita desmarca entregue. */
export async function POST(req: Request) {
  const q = await quemEstaAqui();
  if (!q.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!q.lembrancinha) return NextResponse.json({ error: "Só Julia Rodrigues e Junior marcam as lembrancinhas." }, { status: 403 });

  let b: { pessoa_id?: number; anos?: number; campo?: string; valor?: boolean };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const { pessoa_id, anos, campo, valor } = b;
  if (!Number.isInteger(pessoa_id) || !Number.isInteger(anos) || (anos as number) < 1
      || (campo !== "feita" && campo !== "entregue") || typeof valor !== "boolean") {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const sb = admin();
  if (!sb) return NextResponse.json({ error: "Banco indisponível." }, { status: 500 });
  const { data: existente } = await sb.from("pessoas_lembrancinhas").select("*").eq("pessoa_id", pessoa_id).eq("anos", anos).maybeSingle();
  const agora = new Date().toISOString();
  const nova = {
    pessoa_id, anos,
    feita_em: existente?.feita_em ?? null, feita_por: existente?.feita_por ?? null,
    entregue_em: existente?.entregue_em ?? null, entregue_por: existente?.entregue_por ?? null,
  };
  if (campo === "feita") {
    if (valor) { nova.feita_em = nova.feita_em ?? agora; nova.feita_por = nova.feita_por ?? q.email; }
    else { nova.feita_em = nova.feita_por = nova.entregue_em = nova.entregue_por = null; }
  } else if (valor) {
    nova.feita_em = nova.feita_em ?? agora; nova.feita_por = nova.feita_por ?? q.email;
    nova.entregue_em = agora; nova.entregue_por = q.email;
  } else {
    nova.entregue_em = nova.entregue_por = null;
  }
  const { error } = await sb.from("pessoas_lembrancinhas").upsert(nova, { onConflict: "pessoa_id,anos" });
  if (error) return NextResponse.json({ error: "Não consegui salvar." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
