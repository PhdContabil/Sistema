import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { admin, encarregadoDoSetor, formatarPeriodos, type PeriodoFerias } from "@/lib/pessoas/ferias";
import { enviarEmail, notificarTeams, avisarCanal, layoutEmail } from "@/lib/pessoas/notificar";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://system-contabilidade.vercel.app";

/** Cria uma solicitação de férias e avisa o encarregado do setor. */
export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const sb = admin();
  if (!sb) return NextResponse.json({ error: "Banco indisponível." }, { status: 500 });

  let body: { periodos?: PeriodoFerias[]; observacao?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  const periodos = (body.periodos ?? []).filter((p) => p?.inicio && p?.fim);
  if (periodos.length === 0) return NextResponse.json({ error: "Informe ao menos um período." }, { status: 400 });
  for (const p of periodos) {
    if (p.fim < p.inicio) return NextResponse.json({ error: "A data final não pode ser anterior à inicial." }, { status: 400 });
  }

  // perfil do solicitante
  const { data: perfil } = await sb
    .from("pessoas_perfil").select("id,nome,setor").ilike("email", email).maybeSingle();
  if (!perfil) {
    return NextResponse.json({ error: "Seu e-mail ainda não está vinculado a um cadastro em Pessoas." }, { status: 400 });
  }

  const { data: sol, error } = await sb
    .from("ferias_solicitacoes")
    .insert({ pessoa_id: perfil.id, solicitante: email, setor: perfil.setor, observacao: body.observacao || null })
    .select("id").single();
  if (error || !sol) return NextResponse.json({ error: error?.message ?? "Falha ao salvar." }, { status: 500 });

  const { error: e2 } = await sb.from("ferias_periodos").insert(
    periodos.map((p) => ({ solicitacao_id: sol.id, inicio: p.inicio, fim: p.fim }))
  );
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  // avisa o encarregado
  const chefe = await encarregadoDoSetor(perfil.setor);
  const resumo = formatarPeriodos(periodos);
  const link = `${BASE}/m/pessoas/ferias/aprovacoes`;

  if (chefe?.email) {
    const html = layoutEmail(
      "Nova solicitação de férias",
      `<p><strong>${perfil.nome}</strong> (${perfil.setor}) solicitou férias.</p>
       <p><strong>Período:</strong> ${resumo}</p>
       ${body.observacao ? `<p><strong>Observação:</strong> ${body.observacao}</p>` : ""}
       <p>Sua avaliação é necessária para aprovar ou recusar.</p>`,
      { texto: "Avaliar solicitação", url: link }
    );
    await enviarEmail(chefe.email, `Férias — ${perfil.nome} aguarda sua aprovação`, html);
    // Mensagem no Teams pelo melhor canal disponível
    await notificarTeams(
      chefe.email,
      "Nova solicitação de férias",
      `${perfil.nome} (${perfil.setor}) solicitou férias: ${resumo}. Sua aprovação é necessária.`,
      link
    );
  }
  await avisarCanal(`🏖️ **${perfil.nome}** (${perfil.setor}) solicitou férias — ${resumo}. Avaliação: ${link}`);

  return NextResponse.json({ ok: true, id: sol.id, encarregado: chefe?.nome ?? null });
}
