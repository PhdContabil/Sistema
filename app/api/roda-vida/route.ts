import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import {
  rodaAtual, historico, abrirRoda, concluirRoda, excluirRoda,
  salvarReflexao, donoDaRoda, podeVer,
} from "@/lib/roda-vida";

export const dynamic = "force-dynamic";

async function quem(): Promise<string | null> {
  const u = await getCurrentUser().catch(() => null);
  return u?.email?.toLowerCase() ?? null;
}

/** A roda de quem está logado (ou de `email`, se a diretoria pedir). */
export async function GET(req: Request) {
  const email = await quem();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const alvo = (new URL(req.url).searchParams.get("email") ?? email).toLowerCase();
  if (!podeVer(email, alvo)) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });

  const [atual, anteriores] = await Promise.all([rodaAtual(alvo), historico(alvo)]);
  return NextResponse.json({ roda: atual, historico: anteriores });
}

/** Abre um rascunho novo (ou devolve o que já estava aberto). */
export async function POST() {
  const email = await quem();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id, error } = await abrirRoda(email);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(req: Request) {
  const email = await quem();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: { id?: string; acao?: string; reflexao?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "Roda não informada." }, { status: 400 });

  // Ver é uma coisa, mexer é outra: a diretoria lê, mas não edita a roda
  // de ninguém — o texto é da pessoa.
  const dono = await donoDaRoda(body.id);
  if (!dono || dono.toLowerCase() !== email) {
    return NextResponse.json({ error: "Só o dono da roda pode alterá-la." }, { status: 403 });
  }

  if (body.reflexao !== undefined) {
    const erro = await salvarReflexao(body.id, body.reflexao?.trim() || null);
    if (erro) return NextResponse.json({ error: erro }, { status: 500 });
  }

  // Só fechar. Roda fechada não reabre: se ela pudesse mudar depois, a linha
  // do tempo mudaria junto e a comparação entre rodas perderia o sentido.
  if (body.acao === "concluir") {
    const erro = await concluirRoda(body.id);
    if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const email = await quem();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Roda não informada." }, { status: 400 });

  const dono = await donoDaRoda(id);
  if (!dono || dono.toLowerCase() !== email) {
    return NextResponse.json({ error: "Só o dono da roda pode excluí-la." }, { status: 403 });
  }

  const erro = await excluirRoda(id);
  if (erro) return NextResponse.json({ error: erro }, { status: 500 });
  return NextResponse.json({ ok: true });
}
