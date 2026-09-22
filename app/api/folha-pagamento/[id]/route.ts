import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { atualizarFolha, excluirFolha, type NovaFolhaPagamento } from "@/lib/folha-pagamento";

export const dynamic = "force-dynamic";

async function souAutorizado() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return podeAcessarApp(nivel, "trabalhista", "Folha de Pagamento");
}

function validarCorpo(body: Partial<NovaFolhaPagamento>): string | null {
  if (!body.funcionario || !body.funcionario.trim()) return "Funcionário é obrigatório.";
  if (!body.empresa || !body.empresa.trim()) return "Empresa é obrigatória.";
  if (!body.competencia || !body.competencia.trim()) return "Competência é obrigatória.";
  if (!body.status || !body.status.trim()) return "Status é obrigatório.";
  return null;
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao módulo Trabalhista." }, { status: 403 });
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Id inválido." }, { status: 400 });

  let body: Partial<NovaFolhaPagamento>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const erroValidacao = validarCorpo(body);
  if (erroValidacao) return NextResponse.json({ error: erroValidacao }, { status: 400 });

  const bruto = body.salario_bruto ?? 0;
  const descontos = body.descontos ?? 0;

  const erro = await atualizarFolha(id, {
    funcionario: body.funcionario!.trim(),
    empresa: body.empresa!.trim(),
    competencia: body.competencia!.trim(),
    salario_bruto: bruto,
    descontos,
    salario_liquido: body.salario_liquido ?? bruto - descontos,
    status: body.status!.trim(),
    observacao: body.observacao?.trim() || null,
  });
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao módulo Trabalhista." }, { status: 403 });
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Id inválido." }, { status: 400 });
  const erro = await excluirFolha(id);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
