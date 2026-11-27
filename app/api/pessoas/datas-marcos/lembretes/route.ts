// Lembretes de Datas e Marcos: o RH liga/desliga e pede uma prévia no próprio e-mail.
import { NextResponse } from "next/server";
import { admin } from "@/lib/pessoas/ferias";
import { quemEstaAqui } from "@/lib/pessoas/datas-marcos-dados";
import { enviarPreviaLembrete } from "@/lib/pessoas/datas-marcos-lembretes";

export const dynamic = "force-dynamic";
const CHAVES = ["resumo_mes", "tempo_casa", "experiencia"];

async function exigeRH() {
  const q = await quemEstaAqui();
  if (!q.email) return { erro: NextResponse.json({ error: "Não autenticado." }, { status: 401 }), q };
  if (!q.rh) return { erro: NextResponse.json({ error: "Só o RH altera os lembretes." }, { status: 403 }), q };
  return { erro: null, q };
}

/** Liga ou desliga um lembrete. */
export async function PATCH(req: Request) {
  const { erro, q } = await exigeRH();
  if (erro) return erro;
  let b: { chave?: string; ativo?: boolean };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!b.chave || !CHAVES.includes(b.chave) || typeof b.ativo !== "boolean") {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const sb = admin();
  if (!sb) return NextResponse.json({ error: "Banco indisponível." }, { status: 500 });
  const { error } = await sb.from("lembretes_config")
    .update({ ativo: b.ativo, atualizado_por: q.email, atualizado_em: new Date().toISOString() }).eq("chave", b.chave);
  if (error) return NextResponse.json({ error: "Não consegui salvar." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Prévia: manda o lembrete só para quem pediu. */
export async function POST(req: Request) {
  const { erro, q } = await exigeRH();
  if (erro) return erro;
  let b: { chave?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!b.chave || !CHAVES.includes(b.chave)) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  try {
    const r = await enviarPreviaLembrete(b.chave, q.email);
    return NextResponse.json({ ok: r.ok, assunto: r.assunto, para: q.email });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao enviar a prévia." }, { status: 400 });
  }
}
