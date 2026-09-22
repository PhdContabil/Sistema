import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { atualizarApuracao, excluirApuracao, IMPOSTOS, type NovaApuracaoImposto } from "@/lib/apuracao-impostos";

export const dynamic = "force-dynamic";

async function souAutorizado() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return podeAcessarApp(nivel, "fiscal", "Apuração de Impostos");
}

function validarCorpo(body: Partial<NovaApuracaoImposto>): string | null {
  if (!body.empresa || !body.empresa.trim()) return "Empresa é obrigatória.";
  if (!body.imposto || !(IMPOSTOS as readonly string[]).includes(body.imposto)) return "Imposto inválido.";
  if (!body.competencia || !body.competencia.trim()) return "Competência é obrigatória.";
  if (!body.status || !body.status.trim()) return "Status é obrigatório.";
  return null;
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Id inválido." }, { status: 400 });

  let body: Partial<NovaApuracaoImposto>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const erroValidacao = validarCorpo(body);
  if (erroValidacao) return NextResponse.json({ error: erroValidacao }, { status: 400 });

  const erro = await atualizarApuracao(id, {
    empresa: body.empresa!.trim(),
    imposto: body.imposto!,
    competencia: body.competencia!.trim(),
    valor_apurado: body.valor_apurado ?? null,
    vencimento: body.vencimento || null,
    status: body.status!.trim(),
    observacao: body.observacao?.trim() || null,
  });
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Id inválido." }, { status: 400 });
  const erro = await excluirApuracao(id);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
