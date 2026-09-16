import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso } from "@/lib/acesso";
import { atualizarItemInventario, excluirItemInventario, type NovoItemInventario } from "@/lib/inventario";

export const dynamic = "force-dynamic";

async function souAdmin() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return nivel.acessoTotal;
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  if (!(await souAdmin())) return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  let body: Partial<NovoItemInventario>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  if (!body.categoria || !body.item?.trim() || !body.status?.trim()) {
    return NextResponse.json({ error: "Categoria, item e status são obrigatórios." }, { status: 400 });
  }

  const erro = await atualizarItemInventario(id, {
    categoria: body.categoria,
    item: body.item.trim(),
    responsavel: body.responsavel?.trim() || null,
    setor: body.setor?.trim() || null,
    marca: body.marca?.trim() || null,
    especificacao: body.especificacao?.trim() || null,
    ano: body.ano ?? null,
    categoria_periferico: body.categoria_periferico?.trim() || null,
    status: body.status.trim(),
    quantidade: body.quantidade && body.quantidade > 0 ? body.quantidade : 1,
    observacao: body.observacao?.trim() || null,
  });
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await souAdmin())) return NextResponse.json({ error: "Apenas administradores." }, { status: 403 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const erro = await excluirItemInventario(id);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
