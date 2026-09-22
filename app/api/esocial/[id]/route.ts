import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { atualizarEventoEsocial, excluirEventoEsocial, TIPOS_EVENTO_ESOCIAL, type NovoEsocialEvento } from "@/lib/esocial";

export const dynamic = "force-dynamic";

async function souAutorizado() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return podeAcessarApp(nivel, "trabalhista", "eSocial");
}

function validarCorpo(body: Partial<NovoEsocialEvento>): string | null {
  if (!body.empresa || !body.empresa.trim()) return "Empresa é obrigatória.";
  if (!body.tipo_evento || !(TIPOS_EVENTO_ESOCIAL as readonly string[]).includes(body.tipo_evento)) return "Tipo de evento inválido.";
  if (!body.competencia || !body.competencia.trim()) return "Competência é obrigatória.";
  if (!body.status || !body.status.trim()) return "Status é obrigatório.";
  return null;
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao módulo Trabalhista." }, { status: 403 });
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Id inválido." }, { status: 400 });

  let body: Partial<NovoEsocialEvento>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const erroValidacao = validarCorpo(body);
  if (erroValidacao) return NextResponse.json({ error: erroValidacao }, { status: 400 });

  const erro = await atualizarEventoEsocial(id, {
    empresa: body.empresa!.trim(),
    tipo_evento: body.tipo_evento!,
    competencia: body.competencia!.trim(),
    data_envio: body.data_envio || null,
    protocolo: body.protocolo?.trim() || null,
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
  const erro = await excluirEventoEsocial(id);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
