import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { ticketsDb, detalheTicket, ehStatus, ehPrioridade, podeEditarMedicao, podeVerMedicao, SETOR_NOME } from "@/lib/tickets";
import { sendTeamsNotification, sendFinalizedNotification } from "@/lib/teams";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://system-contabilidade.vercel.app";

/** Aceita número, string com vírgula ou vazio (que limpa o campo). */
function numeroOuNulo(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export const dynamic = "force-dynamic";

/** Detalhe completo do ticket: comentários, anexos e responsáveis. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const d = await detalheTicket(params.id);
  if (!d) return NextResponse.json({ error: "Ticket não encontrado." }, { status: 404 });
  return NextResponse.json(d);
}

/** Atualiza status, prioridade ou responsáveis. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const db = ticketsDb();
  if (!db) return NextResponse.json({ error: "Banco de tickets não configurado." }, { status: 500 });

  let body: {
    status?: string; priority?: string; title?: string; description?: string;
    assumir?: boolean; remover?: boolean;
    atribuir?: string; desatribuir?: string;
    horas_estimadas?: unknown; horas_realizadas?: unknown;
    ganho_horas_mes?: unknown; valor_hora?: unknown;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  // Título, setor e status de ANTES da alteração — usados só pra decidir se
  // dispara notificação no Teams (mudança pra "finalizado") e pro card em si.
  let ticketAntes: { title: string; sector: string; status: string } | null = null;
  if (body.status !== undefined || body.assumir || body.atribuir) {
    const { data } = await db
      .from("tickets")
      .select("title,sector,status")
      .eq("id", params.id)
      .maybeSingle();
    ticketAntes = (data as { title: string; sector: string; status: string } | null) ?? null;
  }

  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!ehStatus(body.status)) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    patch.status = body.status;
    // Marca de fechamento própria: no sistema antigo só existia updated_at,
    // que qualquer edição resetava, e por isso não dava para medir o tempo
    // real de atendimento. A partir daqui passa a dar.
    patch.closed_at = body.status === "finalizado" ? new Date().toISOString() : null;
  }
  if (body.priority !== undefined) {
    if (!ehPrioridade(body.priority)) return NextResponse.json({ error: "Prioridade inválida." }, { status: 400 });
    patch.priority = body.priority;
  }
  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "O título não pode ficar vazio." }, { status: 400 });
    patch.title = t;
  }
  if (typeof body.description === "string") patch.description = body.description.trim();

  // Horas, valor/hora e ganho: só admin ou sub-admin. A checagem é aqui no
  // servidor — esconder o campo na tela não é controle de acesso.
  const camposMedicao = ["horas_estimadas", "horas_realizadas", "ganho_horas_mes", "valor_hora"] as const;
  const mexeuEmMedicao = camposMedicao.some((c) => body[c] !== undefined);

  if (mexeuEmMedicao) {
    if (!(await podeVerMedicao(email))) {
      return NextResponse.json(
        { error: "Só administradores podem editar horas e valores." },
        { status: 403 }
      );
    }
    for (const c of camposMedicao) {
      const v = numeroOuNulo(body[c]);
      if (v === undefined && body[c] !== undefined) {
        return NextResponse.json({ error: `Valor inválido em ${c}.` }, { status: 400 });
      }
      if (v !== undefined) patch[c] = v;
    }
  }

  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString();
    const { error } = await db.from("tickets").update(patch).eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nomeQuemAge = (user?.user_metadata?.full_name as string | undefined) ?? email;

  // Atribuição: cada um assume ou larga o próprio ticket.
  if (body.assumir) {
    const nome = (user?.user_metadata?.full_name as string | undefined) ?? null;
    const { error } = await db
      .from("ticket_assignees")
      .upsert({ ticket_id: params.id, user_email: email, user_name: nome },
              { onConflict: "ticket_id,user_email" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (ticketAntes) {
      sendTeamsNotification({
        to: [{ email, name: nome }],
        ticketTitle: ticketAntes.title,
        ticketId: params.id,
        sectorLabel: SETOR_NOME[ticketAntes.sector] ?? ticketAntes.sector,
        assignerName: nomeQuemAge,
        appUrl: APP_URL,
      }).then((r) => { if (!r.ok) console.warn("[teams/assumir]", r.error); });
    }
  }
  if (body.remover) {
    const { error } = await db
      .from("ticket_assignees").delete()
      .eq("ticket_id", params.id).eq("user_email", email);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Atribuir outra pessoa: o nome vem do cadastro, não do cliente.
  if (body.atribuir) {
    const alvo = body.atribuir.toLowerCase();
    const { data: p } = await db
      .from("ticket_users").select("name").ilike("email", alvo).maybeSingle();
    const { error } = await db
      .from("ticket_assignees")
      .upsert({ ticket_id: params.id, user_email: alvo, user_name: p?.name ?? null },
              { onConflict: "ticket_id,user_email" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (ticketAntes) {
      sendTeamsNotification({
        to: [{ email: alvo, name: p?.name ?? null }],
        ticketTitle: ticketAntes.title,
        ticketId: params.id,
        sectorLabel: SETOR_NOME[ticketAntes.sector] ?? ticketAntes.sector,
        assignerName: nomeQuemAge,
        appUrl: APP_URL,
      }).then((r) => { if (!r.ok) console.warn("[teams/atribuir]", r.error); });
    }
  }
  if (body.desatribuir) {
    const { error } = await db
      .from("ticket_assignees").delete()
      .eq("ticket_id", params.id).eq("user_email", body.desatribuir.toLowerCase());
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notificação de FINALIZAÇÃO: dispara só quando o status muda PARA
  // "finalizado" (não quando já estava e a edição foi outra coisa).
  if (ticketAntes && body.status === "finalizado" && ticketAntes.status !== "finalizado") {
    sendFinalizedNotification({
      ticketTitle: ticketAntes.title,
      ticketId: params.id,
      sectorLabel: SETOR_NOME[ticketAntes.sector] ?? ticketAntes.sector,
      finalizerName: nomeQuemAge,
      appUrl: APP_URL,
    }).then((r) => { if (!r.ok) console.warn("[teams/finalizado]", r.error); });
  }

  return NextResponse.json({ ok: true });
}

/** Exclui o ticket e tudo que depende dele. Só admin ou sub-admin. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await podeEditarMedicao(email))) {
    return NextResponse.json({ error: "Só administradores podem excluir tickets." }, { status: 403 });
  }

  const db = ticketsDb();
  if (!db) return NextResponse.json({ error: "Banco de tickets não configurado." }, { status: 500 });

  // Sem cascade configurado no banco — apaga o que depende do ticket antes
  // dele mesmo, senão a FK barra o delete da linha principal.
  await db.from("ticket_comments").delete().eq("ticket_id", params.id);
  await db.from("ticket_attachments").delete().eq("ticket_id", params.id);
  await db.from("ticket_assignees").delete().eq("ticket_id", params.id);

  const { error } = await db.from("tickets").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
