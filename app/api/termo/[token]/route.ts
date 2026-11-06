import { NextResponse } from "next/server";
import { lerTermos, salvarTermos, publico, textoTermo, hashTexto, sb } from "@/lib/inventario-termos";

// Link público de assinatura do termo (sem login): o token de 48 caracteres é a autorização.
export const dynamic = "force-dynamic";

const validoToken = (t: string) => /^[a-f0-9]{48}$/.test(t);

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  if (!validoToken(params.token)) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  const t = (await lerTermos()).find((x) => x.token === params.token);
  if (!t || t.status === "cancelado") return NextResponse.json({ error: "Termo não encontrado ou cancelado." }, { status: 404 });
  return NextResponse.json(publico(t));
}

/** Assina: nome, CPF, aceite e a assinatura desenhada. Atrela o equipamento à pessoa no inventário. */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  if (!validoToken(params.token)) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  let b: { nome?: string; cpf?: string; aceite?: boolean; imagem?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const nome = String(b.nome ?? "").trim().slice(0, 150);
  const cpf = String(b.cpf ?? "").replace(/\D/g, "");
  const img = String(b.imagem ?? "");
  if (nome.length < 5) return NextResponse.json({ error: "Informe seu nome completo." }, { status: 400 });
  if (cpf.length !== 11) return NextResponse.json({ error: "Informe um CPF válido (11 números)." }, { status: 400 });
  if (!b.aceite) return NextResponse.json({ error: "É preciso marcar que leu e concorda com o termo." }, { status: 400 });
  if (!img.startsWith("data:image/png;base64,") || img.length < 1500 || img.length > 400000) return NextResponse.json({ error: "Desenhe sua assinatura no quadro." }, { status: 400 });

  const lista = await lerTermos();
  const t = lista.find((x) => x.token === params.token);
  if (!t || t.status === "cancelado") return NextResponse.json({ error: "Termo não encontrado ou cancelado." }, { status: 404 });
  if (t.status !== "pendente") return NextResponse.json({ error: "Este termo já foi assinado." }, { status: 409 });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  t.status = "assinado";
  t.colaborador.cpf = cpf;
  t.assinatura = { nome, cpf, imagem: img, em: new Date().toISOString(), ip, navegador: (req.headers.get("user-agent") ?? "").slice(0, 300) || null, hash_texto: hashTexto(textoTermo(t)) };
  const erro = await salvarTermos(lista);
  if (erro) return NextResponse.json({ error: "Não foi possível salvar a assinatura. Tente de novo." }, { status: 500 });

  // Equipamento atrelado à pessoa no inventário (não trava a assinatura se falhar).
  try {
    const c = sb();
    if (c) {
      const { data: it } = await c.from("inventario_ti").select("categoria,quantidade").eq("id", t.equipamento.item_id).maybeSingle();
      const up: Record<string, unknown> = { responsavel: t.colaborador.nome, setor: t.colaborador.setor, atualizado_em: new Date().toISOString() };
      if (it?.categoria === "notebook_estoque" && Number(it.quantidade) === 1) { up.categoria = "notebook_uso"; up.status = "Ativo"; }
      await c.from("inventario_ti").update(up).eq("id", t.equipamento.item_id);
    }
  } catch { /* segue */ }
  return NextResponse.json({ ok: true, ...publico(t) });
}
