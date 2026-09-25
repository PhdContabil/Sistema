import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { listarClientes, criarCliente, type Cliente } from "@/lib/paralegal/clientes";
import { GraphErro } from "@/lib/paralegal/graph";

// Paralegal · Controle — Clientes. Migrado do Paralegal System (lista SharePoint "Clientes").
export const dynamic = "force-dynamic";

async function souAutorizado() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return podeAcessarApp(nivel, "paralegal", "Controle");
}

function validarCorpo(body: Partial<Cliente>): string | null {
  if (!body.nome || !body.nome.trim()) return "Nome é obrigatório.";
  return null;
}

export async function GET() {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });
  try {
    const itens = await listarClientes();
    return NextResponse.json({ itens });
  } catch (e) {
    const status = e instanceof GraphErro ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao listar clientes." }, { status });
  }
}

export async function POST(req: Request) {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });

  let body: Partial<Cliente>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const erroValidacao = validarCorpo(body);
  if (erroValidacao) return NextResponse.json({ error: erroValidacao }, { status: 400 });

  try {
    const cliente = await criarCliente({
      nome: body.nome!.trim(),
      empresa: body.empresa?.trim() ?? "",
      cnpj: body.cnpj?.trim() ?? "",
      indicacao: body.indicacao?.trim() ?? "",
      categoria: body.categoria?.trim() ?? "",
      vendedor: body.vendedor?.trim() ?? "",
    });
    return NextResponse.json({ ok: true, cliente });
  } catch (e) {
    const status = e instanceof GraphErro ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao criar cliente." }, { status });
  }
}
