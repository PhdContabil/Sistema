import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso } from "@/lib/acesso";
import {
  listarInventario,
  criarItemInventario,
  type CategoriaInventario,
  type NovoItemInventario,
} from "@/lib/inventario";

// Inventário de T.I. — mesmo nível de acesso do resto de Tecnologia fora de
// Tickets: só T.I./Diretoria (nivel.acessoTotal), ver lib/acesso.ts.

export const dynamic = "force-dynamic";

async function souAdmin() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return nivel.acessoTotal;
}

const CATEGORIAS: CategoriaInventario[] = ["notebook_uso", "notebook_estoque", "periferico"];

function validarCorpo(body: Partial<NovoItemInventario>): string | null {
  if (!body.categoria || !CATEGORIAS.includes(body.categoria)) return "Categoria inválida.";
  if (!body.item || !body.item.trim()) return "Item é obrigatório.";
  if (!body.status || !body.status.trim()) return "Status é obrigatório.";
  return null;
}

export async function GET() {
  if (!(await souAdmin())) return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });
  const { itens, erro } = await listarInventario();
  if (erro) return NextResponse.json({ error: `Não foi possível carregar o inventário: ${erro}` }, { status: 502 });
  return NextResponse.json({ itens });
}

export async function POST(req: Request) {
  if (!(await souAdmin())) return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });

  let body: Partial<NovoItemInventario>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const erroValidacao = validarCorpo(body);
  if (erroValidacao) return NextResponse.json({ error: erroValidacao }, { status: 400 });

  const erro = await criarItemInventario({
    categoria: body.categoria!,
    item: body.item!.trim(),
    responsavel: body.responsavel?.trim() || null,
    setor: body.setor?.trim() || null,
    marca: body.marca?.trim() || null,
    especificacao: body.especificacao?.trim() || null,
    ano: body.ano ?? null,
    categoria_periferico: body.categoria_periferico?.trim() || null,
    status: body.status!.trim(),
    quantidade: body.quantidade && body.quantidade > 0 ? body.quantidade : 1,
    observacao: body.observacao?.trim() || null,
  });
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
