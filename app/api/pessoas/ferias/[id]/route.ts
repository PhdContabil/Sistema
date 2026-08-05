import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { admin, formatarPeriodos, type PeriodoFerias } from "@/lib/pessoas/ferias";
import { enviarEmail, avisarTeams, avisarCanal, layoutEmail } from "@/lib/pessoas/notificar";

export const dynamic = "force-dynamic";
const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://system-contabilidade.vercel.app";

/** Aprova, rejeita ou cancela uma solicitação e notifica o colaborador. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const sb = admin();
  if (!sb) return NextResponse.json({ error: "Banco indisponível." }, { status: 500 });

  let body: { acao?: string; motivo?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const acao = body.acao;
  if (!["aprovar", "rejeitar", "cancelar"].includes(acao ?? "")) {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }

  const { data: sol } = await sb
    .from("ferias_solicitacoes")
    .select("id,pessoa_id,solicitante,setor,status,observacao")
    .eq("id", Number(params.id))
    .maybeSingle();
  if (!sol) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
  if (sol.status !== "pendente") {
    return NextResponse.json({ error: "Esta solicitação já foi avaliada." }, { status: 409 });
  }

  // quem está avaliando
  const { data: avaliador } = await sb
    .from("pessoas_perfil").select("nome,encarregado,setor").ilike("email", email).maybeSingle();

  if (acao === "cancelar") {
    if (sol.solicitante.toLowerCase() !== email) {
      return NextResponse.json({ error: "Só quem pediu pode cancelar." }, { status: 403 });
    }
  } else if (!avaliador?.encarregado) {
    return NextResponse.json({ error: "Apenas encarregados podem aprovar ou recusar." }, { status: 403 });
  }

  const novoStatus = acao === "aprovar" ? "aprovada" : acao === "rejeitar" ? "rejeitada" : "cancelada";

  const { error: eUp } = await sb
    .from("ferias_solicitacoes")
    .update({
      status: novoStatus,
      aprovador: acao === "cancelar" ? null : email,
      avaliado_em: new Date().toISOString(),
      motivo_recusa: acao === "rejeitar" ? (body.motivo || null) : null,
    })
    .eq("id", sol.id);
  if (eUp) return NextResponse.json({ error: eUp.message }, { status: 500 });

  const { data: periodos } = await sb
    .from("ferias_periodos").select("inicio,fim").eq("solicitacao_id", sol.id);
  const resumo = formatarPeriodos((periodos ?? []) as PeriodoFerias[]);

  const { data: pessoa } = await sb
    .from("pessoas_perfil").select("nome").eq("id", sol.pessoa_id).maybeSingle();
  const nome = pessoa?.nome ?? "Colaborador";

  // Aprovada -> entra na agenda; senão remove eventos daquela solicitação
  if (acao === "aprovar" && periodos?.length) {
    await sb.from("eventos_agenda").insert(
      periodos.map((p) => ({
        tipo: "ferias",
        titulo: `Férias: ${nome}`,
        pessoa_id: sol.pessoa_id,
        inicio: p.inicio,
        fim: p.fim,
        detalhe: sol.setor,
        origem: `ferias:${sol.id}`,
      }))
    );
  } else {
    await sb.from("eventos_agenda").delete().eq("origem", `ferias:${sol.id}`);
  }

  // Notifica o colaborador
  const link = `${BASE}/m/pessoas/ferias`;
  if (acao !== "cancelar") {
    const aprovado = acao === "aprovar";
    const titulo = aprovado ? "Suas férias foram aprovadas" : "Suas férias foram recusadas";
    const html = layoutEmail(
      titulo,
      `<p>Olá, ${nome}.</p>
       <p>Sua solicitação de férias (<strong>${resumo}</strong>) foi
       <strong style="color:${aprovado ? "#16a34a" : "#dc2626"}">${aprovado ? "APROVADA" : "RECUSADA"}</strong>
       por ${avaliador?.nome ?? email}.</p>
       ${!aprovado && body.motivo ? `<p><strong>Motivo:</strong> ${body.motivo}</p>` : ""}
       ${aprovado ? "<p>O período já aparece na agenda do escritório.</p>" : "<p>Converse com seu encarregado para reprogramar.</p>"}`,
      { texto: "Ver minhas férias", url: link }
    );
    await enviarEmail(sol.solicitante, titulo, html);
    await avisarTeams(sol.solicitante, `${titulo}: ${resumo}`, link);
    await avisarCanal(`${aprovado ? "✅" : "❌"} Férias de **${nome}** ${aprovado ? "aprovadas" : "recusadas"} — ${resumo}`);
  }

  return NextResponse.json({ ok: true, status: novoStatus });
}
