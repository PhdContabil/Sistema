import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { listarFolha, criarFolha, type NovaFolhaPagamento } from "@/lib/folha-pagamento";

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

export async function GET() {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao módulo Trabalhista." }, { status: 403 });
  const { itens, erro } = await listarFolha();
  if (erro) return NextResponse.json({ error: `Não foi possível carregar a folha: ${erro}` }, { status: 502 });
  return NextResponse.json({ itens });
}

export async function POST(req: Request) {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao módulo Trabalhista." }, { status: 403 });

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

  const erro = await criarFolha({
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
