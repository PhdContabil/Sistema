import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { listarContratos, criarContrato, type Contrato } from "@/lib/paralegal/contratos";
import { GraphErro } from "@/lib/paralegal/graph";

// Paralegal · Controle — contratos. Migrado do Paralegal System.
export const dynamic = "force-dynamic";

async function souAutorizado() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return podeAcessarApp(nivel, "paralegal", "Controle");
}

function validarCorpo(body: Partial<Contrato>): string | null {
  if (!body.titulo || !body.titulo.trim()) return "Campo obrigatório: titulo.";
  return null;
}

export async function GET() {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });
  try {
    const itens = await listarContratos();
    return NextResponse.json({ itens });
  } catch (e) {
    const status = e instanceof GraphErro ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao listar." }, { status });
  }
}

export async function POST(req: Request) {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });

  let body: Partial<Contrato>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const erroValidacao = validarCorpo(body);
  if (erroValidacao) return NextResponse.json({ error: erroValidacao }, { status: 400 });

  try {
    const { id: _id, ...dados } = body as Contrato;
    const item = await criarContrato(dados);
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const status = e instanceof GraphErro ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao criar." }, { status });
  }
}
