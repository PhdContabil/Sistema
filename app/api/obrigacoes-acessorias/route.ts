import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { listarObrigacoes, criarObrigacao, type NovaObrigacaoAcessoria } from "@/lib/obrigacoes-acessorias";

export const dynamic = "force-dynamic";

async function souAutorizado() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return podeAcessarApp(nivel, "fiscal", "Obrigações Acessórias");
}

function validarCorpo(body: Partial<NovaObrigacaoAcessoria>): string | null {
  if (!body.empresa || !body.empresa.trim()) return "Empresa é obrigatória.";
  if (!body.obrigacao || !body.obrigacao.trim()) return "Obrigação é obrigatória.";
  if (!body.competencia || !body.competencia.trim()) return "Competência é obrigatória.";
  if (!body.status || !body.status.trim()) return "Status é obrigatório.";
  return null;
}

export async function GET() {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  const { itens, erro } = await listarObrigacoes();
  if (erro) return NextResponse.json({ error: `Não foi possível carregar as obrigações: ${erro}` }, { status: 502 });
  return NextResponse.json({ itens });
}

export async function POST(req: Request) {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });

  let body: Partial<NovaObrigacaoAcessoria>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const erroValidacao = validarCorpo(body);
  if (erroValidacao) return NextResponse.json({ error: erroValidacao }, { status: 400 });

  const erro = await criarObrigacao({
    empresa: body.empresa!.trim(),
    obrigacao: body.obrigacao!.trim(),
    competencia: body.competencia!.trim(),
    vencimento: body.vencimento || null,
    status: body.status!.trim(),
    responsavel: body.responsavel?.trim() || null,
    observacao: body.observacao?.trim() || null,
  });
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
