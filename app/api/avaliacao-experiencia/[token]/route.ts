// Formulário público (sem login) da avaliação de experiência: o token de 48 caracteres é a autorização.
import { NextResponse } from "next/server";
import { admin } from "@/lib/pessoas/ferias";
import { enviarEmail } from "@/lib/pessoas/notificar";
import { avaliacaoPorToken, emailRecebida, RECOMENDACOES, tokenValido } from "@/lib/pessoas/avaliacao-experiencia";
import { RESPONSAVEIS_CONTROLE } from "@/lib/pessoas/datas-marcos-dados";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://system-contabilidade.vercel.app";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const av = await avaliacaoPorToken(params.token);
  if (!av) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  // Só o necessário para montar o formulário: nada da resposta volta pelo link.
  return NextResponse.json({
    colaborador: av.pessoa_nome, fim: av.fim_experiencia,
    encarregado: av.encarregado_nome, respondida: Boolean(av.enviada_em),
  });
}

const nota = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null; };
const texto = (v: unknown) => String(v ?? "").trim().slice(0, 3000);

export async function POST(req: Request, { params }: { params: { token: string } }) {
  if (!tokenValido(params.token)) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  const av = await avaliacaoPorToken(params.token);
  if (!av) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  if (av.enviada_em) return NextResponse.json({ error: "Esta avaliação já foi enviada." }, { status: 409 });

  const notas = {
    nota_desempenho: nota(b.nota_desempenho), nota_assiduidade: nota(b.nota_assiduidade),
    nota_equipe: nota(b.nota_equipe), nota_aprendizado: nota(b.nota_aprendizado),
  };
  if (Object.values(notas).some((n) => n == null)) return NextResponse.json({ error: "Dê uma nota de 1 a 5 em todos os itens." }, { status: 400 });
  const pontos_fortes = texto(b.pontos_fortes);
  const pontos_melhorar = texto(b.pontos_melhorar);
  const recomendacao = String(b.recomendacao ?? "");
  const justificativa = texto(b.justificativa);
  const observacoes = texto(b.observacoes);
  if (pontos_fortes.length < 10) return NextResponse.json({ error: "Descreva os pontos fortes (mínimo de 10 caracteres)." }, { status: 400 });
  if (pontos_melhorar.length < 10) return NextResponse.json({ error: "Descreva os pontos a melhorar (mínimo de 10 caracteres)." }, { status: 400 });
  if (!(recomendacao in RECOMENDACOES)) return NextResponse.json({ error: "Escolha a recomendação." }, { status: 400 });
  if (recomendacao !== "efetivar" && justificativa.length < 10) {
    return NextResponse.json({ error: "Explique a recomendação (mínimo de 10 caracteres)." }, { status: 400 });
  }

  const sb = admin();
  if (!sb) return NextResponse.json({ error: "Banco indisponível." }, { status: 500 });
  // Só grava se ainda não foi enviada (evita envio duplo em cliques simultâneos).
  const { data, error } = await sb.from("avaliacoes_experiencia")
    .update({ ...notas, pontos_fortes, pontos_melhorar, recomendacao, justificativa: justificativa || null, observacoes: observacoes || null, enviada_em: new Date().toISOString() })
    .eq("id", av.id).is("enviada_em", null).select("id");
  if (error) return NextResponse.json({ error: "Não consegui salvar. Tente de novo." }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Esta avaliação já foi enviada." }, { status: 409 });

  // Avisa Julia Rodrigues e Junior (não trava a resposta se o e-mail falhar).
  try {
    const nova = await avaliacaoPorToken(params.token);
    if (nova) {
      const email = emailRecebida(nova, `${BASE}/m/pessoas/datas-marcos`);
      for (const para of RESPONSAVEIS_CONTROLE) await enviarEmail(para, email.assunto, email.html);
    }
  } catch { /* segue */ }
  return NextResponse.json({ ok: true });
}
