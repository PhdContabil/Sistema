import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { admin, ehApoioGestaoPessoas, temVisaoDeGestores } from "@/lib/pessoas/ferias";
import { enviarEmail, notificarTeams, layoutEmail } from "@/lib/pessoas/notificar";
import { lerAusencias, salvarAusencias, quando, TIPOS_AUSENCIA } from "@/lib/pessoas/ausencias";

export const dynamic = "force-dynamic";
const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://system-contabilidade.vercel.app";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** Confirma, nega ou cancela uma ausência e avisa o colaborador. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const sb = admin();
  if (!sb) return NextResponse.json({ error: "Banco indisponível." }, { status: 500 });

  let b: { acao?: string; resposta?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!["aprovar", "rejeitar", "cancelar"].includes(b.acao ?? "")) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });

  const lista = await lerAusencias();
  const a = lista.find((x) => x.id === Number(params.id));
  if (!a) return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
  if (a.status !== "pendente") return NextResponse.json({ error: "Esta solicitação já foi respondida." }, { status: 409 });

  const { data: av } = await sb.from("pessoas_perfil").select("nome,encarregado,setor").ilike("email", email).maybeSingle();
  if (b.acao === "cancelar") {
    if (a.solicitante.toLowerCase() !== email) return NextResponse.json({ error: "Só quem pediu pode cancelar." }, { status: 403 });
  } else {
    const pode = (av?.encarregado && (av.setor === a.setor || temVisaoDeGestores(email, av.setor))) || ehApoioGestaoPessoas(email);
    if (!pode) return NextResponse.json({ error: "Apenas o encarregado do setor (ou Gestores) pode responder." }, { status: 403 });
  }

  a.status = b.acao === "aprovar" ? "aprovada" : b.acao === "rejeitar" ? "rejeitada" : "cancelada";
  a.avaliado_em = new Date().toISOString();
  if (b.acao !== "cancelar") {
    a.aprovador = email;
    a.aprovador_nome = av?.nome ?? email;
    a.resposta = String(b.resposta ?? "").trim().slice(0, 500) || null;
  }
  const erro = await salvarAusencias(lista);
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });

  // Confirmada -> aparece na agenda do escritório (não trava se a agenda recusar).
  try {
    if (a.status === "aprovada") {
      const horas = a.dia_inteiro ? "" : ` ${a.hora_inicio}–${a.hora_fim}`;
      await sb.from("eventos_agenda").insert({
        tipo: "ausencia", titulo: `${a.tipo === "banco_horas" ? "Banco de horas" : "Ausência"}: ${a.nome}${horas}`,
        pessoa_id: a.pessoa_id, inicio: a.data, fim: a.data_fim || a.data, detalhe: a.setor, origem: `ausencia:${a.id}`,
      });
    }
  } catch { /* segue */ }

  if (b.acao !== "cancelar") {
    const ok = a.status === "aprovada";
    const titulo = ok ? "Sua ausência foi confirmada" : "Sua ausência foi negada";
    const resumo = `${TIPOS_AUSENCIA[a.tipo] ?? "Ausência"} — ${quando(a)}`;
    const link = `${BASE}/m/pessoas/ausencias`;
    try {
      await enviarEmail(a.solicitante, titulo, layoutEmail(titulo,
        `<p>Olá, ${esc(a.nome)}.</p>
         <p>Seu pedido (<strong>${esc(resumo)}</strong>) foi
         <strong style="color:${ok ? "#16a34a" : "#dc2626"}">${ok ? "CONFIRMADO" : "NEGADO"}</strong> por ${esc(a.aprovador_nome)}.</p>
         ${a.resposta ? `<p><strong>Resposta:</strong> ${esc(a.resposta)}</p>` : ""}`,
        { texto: "Ver minhas ausências", url: link }));
      await notificarTeams(a.solicitante, titulo, `${resumo}: ${ok ? "CONFIRMADA" : "NEGADA"} por ${a.aprovador_nome}.${a.resposta ? ` ${a.resposta}` : ""}`, link);
    } catch { /* segue */ }
  }
  return NextResponse.json({ ok: true, status: a.status });
}
