import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { admin } from "@/lib/pessoas/ferias";

export const dynamic = "force-dynamic";

// Eventos com inscrição aberta. Um id por evento; a lista é pública para
// todos os logados (a ideia é incentivar: todo mundo vê quem já se inscreveu).
const EVENTOS: Record<string, { modalidades: string[]; encerra: string }> = {
  "circuito-viva-saude-2026": { modalidades: ["3km", "5km", "10km"], encerra: "2026-11-06" },
};

async function contexto(evento: string) {
  if (!EVENTOS[evento]) return { erro: NextResponse.json({ error: "Evento não encontrado." }, { status: 404 }) };
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return { erro: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  const sb = admin();
  if (!sb) return { erro: NextResponse.json({ error: "Banco indisponível." }, { status: 500 }) };
  return { email, sb, user };
}

async function lista(sb: NonNullable<ReturnType<typeof admin>>, evento: string, email: string) {
  const { data, error } = await sb
    .from("eventos_inscricoes")
    .select("email,nome,setor,modalidade,acompanhantes,criado_em")
    .eq("evento", evento)
    .order("criado_em");
  if (error) throw new Error(error.message);
  const inscritos = (data ?? []).map((r) => ({
    nome: r.nome, setor: r.setor, modalidade: r.modalidade, acompanhantes: r.acompanhantes,
    criado_em: r.criado_em, minha: r.email === email,
  }));
  return { inscritos, minha: inscritos.find((i) => i.minha) ?? null };
}

export async function GET(_req: Request, { params }: { params: { evento: string } }) {
  const c = await contexto(params.evento);
  if ("erro" in c) return c.erro;
  try {
    return NextResponse.json({ ...(await lista(c.sb, params.evento, c.email)), encerra: EVENTOS[params.evento].encerra });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status: 500 });
  }
}

/** Inscreve (ou atualiza a inscrição de) quem está logado. */
export async function POST(req: Request, { params }: { params: { evento: string } }) {
  const c = await contexto(params.evento);
  if ("erro" in c) return c.erro;
  const ev = EVENTOS[params.evento];
  if (new Date().toISOString().slice(0, 10) > ev.encerra) {
    return NextResponse.json({ error: "As inscrições para este evento já encerraram." }, { status: 409 });
  }

  let b: { modalidade?: string; acompanhantes?: number };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!b.modalidade || !ev.modalidades.includes(b.modalidade)) {
    return NextResponse.json({ error: "Escolha o circuito." }, { status: 400 });
  }
  const acompanhantes = Math.max(0, Math.min(10, Math.trunc(Number(b.acompanhantes) || 0)));

  const { data: perfil } = await c.sb
    .from("pessoas_perfil").select("nome,setor").ilike("email", c.email).maybeSingle();
  const meta = (c.user?.user_metadata ?? {}) as { full_name?: string; name?: string };
  const nome = perfil?.nome || meta.full_name || meta.name || c.email.split("@")[0];

  const { error } = await c.sb.from("eventos_inscricoes").upsert(
    { evento: params.evento, email: c.email, nome, setor: perfil?.setor ?? null, modalidade: b.modalidade, acompanhantes },
    { onConflict: "evento,email" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(await lista(c.sb, params.evento, c.email));
}

/** Cancela a própria inscrição. */
export async function DELETE(_req: Request, { params }: { params: { evento: string } }) {
  const c = await contexto(params.evento);
  if ("erro" in c) return c.erro;
  const { error } = await c.sb.from("eventos_inscricoes").delete().eq("evento", params.evento).eq("email", c.email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(await lista(c.sb, params.evento, c.email));
}
