import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import {
  listarApuracoes,
  criarApuracao,
  IMPOSTOS,
  type NovaApuracaoImposto,
} from "@/lib/apuracao-impostos";

// Fiscal · Apuração de Impostos — só quem acessa o módulo Fiscal
// (setor "fiscal", T.I. ou Diretoria), ver lib/acesso.ts.

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

export async function GET() {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  const { itens, erro } = await listarApuracoes();
  if (erro) return NextResponse.json({ error: `Não foi possível carregar a apuração: ${erro}` }, { status: 502 });
  return NextResponse.json({ itens });
}

export async function POST(req: Request) {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });

  let body: Partial<NovaApuracaoImposto>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const erroValidacao = validarCorpo(body);
  if (erroValidacao) return NextResponse.json({ error: erroValidacao }, { status: 400 });

  const erro = await criarApuracao({
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
