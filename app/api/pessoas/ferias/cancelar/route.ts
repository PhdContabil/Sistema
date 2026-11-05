import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { admin, formatarPeriodos, type PeriodoFerias } from "@/lib/pessoas/ferias";
import { papelDe, avisarControle } from "@/lib/pessoas/ferias-programacao";
import { excluirFeriasDoQuestor } from "@/lib/pessoas/ferias-questor";
import { enviarEmail, notificarTeams, layoutEmail } from "@/lib/pessoas/notificar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://system-contabilidade.vercel.app";

/**
 * Cancela férias já aprovadas/programadas (líder do setor, gestores ou Márcio).
 * Tira do Questor primeiro; se o DP já calculou o recibo, não cancela.
 * Para remarcar: cancela e programa de novo.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const papel = await papelDe(email);
  if (!papel.programa) return NextResponse.json({ error: "Só o líder do setor ou o controle de férias podem cancelar." }, { status: 403 });

  let b: { solicitacao_id?: number; motivo?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  const sb = admin();
  if (!sb || !b.solicitacao_id) return NextResponse.json({ error: "Informe a solicitação." }, { status: 400 });

  const { data: sol } = await sb.from("ferias_solicitacoes")
    .select("id,pessoa_id,setor,status,solicitante").eq("id", Number(b.solicitacao_id)).maybeSingle();
  if (!sol) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
  if (!papel.todos && sol.setor !== papel.perfil?.setor) return NextResponse.json({ error: "Você só pode cancelar férias do seu setor." }, { status: 403 });
  if (sol.status !== "aprovada") return NextResponse.json({ error: "Só férias aprovadas podem ser canceladas aqui." }, { status: 409 });

  const q = await excluirFeriasDoQuestor(sol.id, email);
  if (!q.ok) return NextResponse.json({ error: q.erro }, { status: 409 });

  await sb.from("ferias_solicitacoes").update({
    status: "cancelada", motivo_recusa: b.motivo || "Cancelada pela liderança/RH", avaliado_em: new Date().toISOString(),
  }).eq("id", sol.id);
  await sb.from("eventos_agenda").delete().eq("origem", `ferias:${sol.id}`);

  const { data: periodos } = await sb.from("ferias_periodos").select("inicio,fim").eq("solicitacao_id", sol.id);
  const resumo = formatarPeriodos((periodos ?? []) as PeriodoFerias[]);
  const { data: pessoa } = await sb.from("pessoas_perfil").select("nome,email").eq("id", sol.pessoa_id).maybeSingle();
  const quem = papel.perfil?.nome ?? email;
  const para = pessoa?.email ?? sol.solicitante;
  if (para) {
    const link = `${BASE}/m/pessoas/ferias`;
    await enviarEmail(para, "Suas férias foram canceladas", layoutEmail("Suas férias foram canceladas",
      `<p>Olá, ${pessoa?.nome ?? ""}.</p><p>${quem} cancelou suas férias (<strong>${resumo}</strong>).</p>
       ${b.motivo ? `<p><strong>Motivo:</strong> ${b.motivo}</p>` : ""}<p>Converse com seu líder para remarcar.</p>`,
      { texto: "Ver minhas férias", url: link }));
    await notificarTeams(para, "Suas férias foram canceladas", `${quem} cancelou suas férias (${resumo}).${b.motivo ? ` Motivo: ${b.motivo}` : ""}`, link);
  }
  if (!email.startsWith("marcio@")) {
    await avisarControle(`${quem} cancelou as férias de ${pessoa?.nome ?? "colaborador"} (${sol.setor}): ${resumo}.`, "Férias canceladas");
  }
  return NextResponse.json({ ok: true });
}
