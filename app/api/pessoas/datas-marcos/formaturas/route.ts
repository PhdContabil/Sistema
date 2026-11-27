// Términos de graduação e mestrado (aba "Datas e campanhas"): só o RH cadastra.
import { NextResponse } from "next/server";
import { admin } from "@/lib/pessoas/ferias";
import { quemEstaAqui } from "@/lib/pessoas/datas-marcos-dados";

export const dynamic = "force-dynamic";

const NIVEIS = ["Graduação", "Pós-graduação", "Mestrado", "Doutorado", "Técnico", "Curso livre"];

async function exigeRH() {
  const q = await quemEstaAqui();
  if (!q.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!q.rh) return NextResponse.json({ error: "Só o RH altera as formaturas." }, { status: 403 });
  return null;
}

/** Cadastra a previsão de término de um curso. A previsão é sempre mês/ano (guardada no dia 1). */
export async function POST(req: Request) {
  const erro = await exigeRH();
  if (erro) return erro;
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  const nomeManual = String(b.nome_manual ?? "").trim().slice(0, 120);
  const pessoaId = nomeManual ? null : Number(b.pessoa_id);
  const curso = String(b.curso ?? "").trim().slice(0, 120);
  const nivel = String(b.nivel ?? "Graduação");
  const ano = Number(b.ano);
  const mes = Number(b.mes);
  if (!nomeManual && (!Number.isInteger(pessoaId) || (pessoaId as number) <= 0)) return NextResponse.json({ error: "Escolha o colaborador ou digite o nome." }, { status: 400 });
  if (!curso) return NextResponse.json({ error: "Informe o curso." }, { status: 400 });
  if (!NIVEIS.includes(nivel)) return NextResponse.json({ error: "Nível inválido." }, { status: 400 });
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return NextResponse.json({ error: "Mês inválido." }, { status: 400 });
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return NextResponse.json({ error: "Ano inválido." }, { status: 400 });

  const sb = admin();
  if (!sb) return NextResponse.json({ error: "Banco indisponível." }, { status: 500 });
  if (pessoaId != null) {
    const { data: pessoa } = await sb.from("pessoas_perfil").select("id").eq("id", pessoaId).maybeSingle();
    if (!pessoa) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 400 });
  }

  const previsao = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const { error } = await sb.from("pessoas_formaturas").insert({ pessoa_id: pessoaId, nome_manual: nomeManual || null, curso, nivel, previsao });
  if (error) return NextResponse.json({ error: "Não consegui salvar." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Remove uma formatura cadastrada (por engano ou concluída). */
export async function DELETE(req: Request) {
  const erro = await exigeRH();
  if (erro) return erro;
  let b: { id?: number };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!Number.isInteger(b.id)) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const sb = admin();
  if (!sb) return NextResponse.json({ error: "Banco indisponível." }, { status: 500 });
  const { error } = await sb.from("pessoas_formaturas").delete().eq("id", b.id);
  if (error) return NextResponse.json({ error: "Não consegui remover." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
