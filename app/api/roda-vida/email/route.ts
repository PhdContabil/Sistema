import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { enviarEmail } from "@/lib/pessoas/notificar";
import { EMAIL } from "@/lib/roda-vida-conteudo";
import { montarEmail } from "@/lib/roda-vida-email";
import { formatDataHora } from "@/lib/datas";
import {
  emailPessoal, salvarEmailPessoal, ehEmail, obterRoda, marcarEnviada, donoDaRoda,
} from "@/lib/roda-vida";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

async function quem(): Promise<string | null> {
  const u = await getCurrentUser().catch(() => null);
  return u?.email?.toLowerCase() ?? null;
}

/** O endereço pessoal já cadastrado, para a tela preencher o campo. */
export async function GET() {
  const email = await quem();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json({ email_pessoal: await emailPessoal(email) });
}

/** Cadastra ou limpa o endereço. */
export async function PUT(req: Request) {
  const email = await quem();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: { email_pessoal?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  const valor = (body.email_pessoal ?? "").trim();
  if (valor && !ehEmail(valor)) {
    return NextResponse.json({ error: "Esse endereço não parece válido." }, { status: 400 });
  }

  const erro = await salvarEmailPessoal(email, valor || null);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true, email_pessoal: valor || null });
}

/** Envia a roda e o plano de ações para o endereço cadastrado. */
export async function POST(req: Request) {
  const email = await quem();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: { roda_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!body.roda_id) return NextResponse.json({ error: "Roda não informada." }, { status: 400 });

  // Só o dono manda a própria roda. Nem a diretoria envia a de outra pessoa:
  // o destino é o e-mail pessoal de alguém, e isso é escolha de quem respondeu.
  const dono = await donoDaRoda(body.roda_id);
  if (!dono || dono.toLowerCase() !== email) {
    return NextResponse.json({ error: "Essa roda não é sua." }, { status: 403 });
  }

  const destino = await emailPessoal(email);
  if (!destino) {
    return NextResponse.json(
      { error: "Cadastre seu e-mail pessoal antes de enviar." },
      { status: 400 }
    );
  }

  const roda = await obterRoda(body.roda_id);
  if (!roda) return NextResponse.json({ error: "Roda não encontrada." }, { status: 404 });
  if (!roda.concluida_em) {
    return NextResponse.json({ error: "Feche a roda antes de enviar." }, { status: 400 });
  }

  const html = montarEmail({
    nome: await nomeDaPessoa(email),
    notas: roda.notas,
    reflexao: roda.reflexao,
    acoes: roda.acoes.map((a) => ({ dimensao: a.dimensao, acao: a.acao })),
    fechadaEm: formatDataHora(roda.concluida_em),
  });

  const ok = await enviarEmail(destino, EMAIL.assunto, html);
  if (!ok) {
    return NextResponse.json(
      { error: "Não consegui enviar agora. Tente de novo em alguns minutos." },
      { status: 502 }
    );
  }

  await marcarEnviada(roda.id, destino);
  return NextResponse.json({ ok: true, destino });
}

/** Primeiro nome para a saudação; sem cadastro, o e-mail vai sem nome. */
async function nomeDaPessoa(email: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await sb.from("pessoas_perfil").select("nome").ilike("email", email).maybeSingle();
  return (data as { nome: string } | null)?.nome ?? null;
}
