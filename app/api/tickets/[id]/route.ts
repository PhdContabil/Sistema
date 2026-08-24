import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { ticketsDb, detalheTicket, ehStatus, ehPrioridade, podeEditarMedicao } from "@/lib/tickets";

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
    if (!(await podeEditarMedicao(email))) {
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

  // Atribuição: cada um assume ou larga o próprio ticket.
  if (body.assumir) {
    const nome = (user?.user_metadata?.full_name as string | undefined) ?? null;
    const { error } = await db
      .from("ticket_assignees")
      .upsert({ ticket_id: params.id, user_email: email, user_name: nome },
              { onConflict: "ticket_id,user_email" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
  }
  if (body.desatribuir) {
    const { error } = await db
      .from("ticket_assignees").delete()
      .eq("ticket_id", params.id).eq("user_email", body.desatribuir.toLowerCase());
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
