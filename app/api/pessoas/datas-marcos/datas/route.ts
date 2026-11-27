// Datas comemorativas e campanhas (aba "Datas e campanhas"): só o RH cadastra.
import { NextResponse } from "next/server";
import { admin } from "@/lib/pessoas/ferias";
import { quemEstaAqui } from "@/lib/pessoas/datas-marcos-dados";
import { diasNoMes } from "@/lib/pessoas/datas-marcos";

export const dynamic = "force-dynamic";

const TIPOS = ["outro", "confraternizacao", "bem_estar", "feriado", "emenda"];
const REGRAS = ["anual", "unica", "mes", "segundo_domingo"];

async function exigeRH() {
  const q = await quemEstaAqui();
  if (!q.email) return { erro: NextResponse.json({ error: "Não autenticado." }, { status: 401 }), q };
  if (!q.rh) return { erro: NextResponse.json({ error: "Só o RH altera as datas." }, { status: 403 }), q };
  return { erro: null, q };
}

/** Cadastra uma data ou campanha. */
export async function POST(req: Request) {
  const { erro, q } = await exigeRH();
  if (erro) return erro;
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  const titulo = String(b.titulo ?? "").trim().slice(0, 120);
  const regra = String(b.regra ?? "");
  const tipo = String(b.tipo ?? "outro");
  if (!titulo) return NextResponse.json({ error: "Informe o título." }, { status: 400 });
  if (!REGRAS.includes(regra)) return NextResponse.json({ error: "Regra inválida." }, { status: 400 });
  if (!TIPOS.includes(tipo)) return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });

  const mes = b.mes == null || b.mes === "" ? null : Number(b.mes);
  const dia = b.dia == null || b.dia === "" ? null : Number(b.dia);
  const unica = b.data_unica ? String(b.data_unica).slice(0, 10) : null;
  const cor = b.cor ? String(b.cor) : null;

  if (regra !== "unica" && (mes == null || !Number.isInteger(mes) || mes < 1 || mes > 12)) {
    return NextResponse.json({ error: "Informe o mês (1 a 12)." }, { status: 400 });
  }
  if (regra === "anual" && (dia == null || !Number.isInteger(dia) || dia < 1 || dia > diasNoMes(2024, mes as number))) {
    return NextResponse.json({ error: "Dia inválido para o mês." }, { status: 400 });
  }
  if (regra === "unica" && (!unica || !/^\d{4}-\d{2}-\d{2}$/.test(unica))) {
    return NextResponse.json({ error: "Informe a data." }, { status: 400 });
  }
  if (cor && (regra !== "mes" || !/^#[0-9a-fA-F]{6}$/.test(cor))) {
    return NextResponse.json({ error: "Cor só vale para campanha do mês, no formato #RRGGBB." }, { status: 400 });
  }

  const sb = admin();
  if (!sb) return NextResponse.json({ error: "Banco indisponível." }, { status: 500 });
  const { error } = await sb.from("datas_comemorativas").insert({
    titulo, tipo, regra,
    mes: regra === "unica" ? null : mes,
    dia: regra === "anual" ? dia : null,
    data_unica: regra === "unica" ? unica : null,
    cor: regra === "mes" ? cor : null,
    criado_por: q.email,
  });
  if (error) return NextResponse.json({ error: "Não consegui salvar." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Liga ou desliga uma data (não apaga: some da agenda, mas o cadastro fica). */
export async function PATCH(req: Request) {
  const { erro } = await exigeRH();
  if (erro) return erro;
  let b: { id?: number; ativo?: boolean };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  if (!Number.isInteger(b.id) || typeof b.ativo !== "boolean") return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const sb = admin();
  if (!sb) return NextResponse.json({ error: "Banco indisponível." }, { status: 500 });
  const { error } = await sb.from("datas_comemorativas").update({ ativo: b.ativo }).eq("id", b.id);
  if (error) return NextResponse.json({ error: "Não consegui salvar." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
