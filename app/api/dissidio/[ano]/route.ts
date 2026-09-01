import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { db } from "@/lib/dissidio";

export const dynamic = "force-dynamic";

function anoValido(v: string): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 2020 && n <= 2100 ? n : null;
}

/**
 * Apaga a rodada inteira do ano.
 *
 * É destrutivo e sem volta: leva junto todos os ajustes daquele ano
 * (ON DELETE CASCADE). Por isso a tela exige que a pessoa digite o ano antes
 * de confirmar, e conferimos de novo aqui — botão desabilitado não é controle.
 */
export async function DELETE(req: Request, { params }: { params: { ano: string } }) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const ano = anoValido(params.ano);
  if (!ano) return NextResponse.json({ error: "Ano inválido." }, { status: 400 });

  let body: { confirmacao?: string };
  try { body = await req.json(); } catch { body = {}; }
  if (String(body.confirmacao ?? "").trim() !== String(ano)) {
    return NextResponse.json(
      { error: "Confirmação inválida: digite o ano da rodada para excluir." },
      { status: 400 }
    );
  }

  const sb = db();
  if (!sb) return NextResponse.json({ error: "Banco indisponível." }, { status: 500 });

  const { count } = await sb
    .from("dissidio_ajustes")
    .select("codigoempresa", { count: "exact", head: true })
    .eq("ano", ano);

  const { error } = await sb.from("dissidio_rodadas").delete().eq("ano", ano);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, ano, ajustes_removidos: count ?? 0, por: email });
}
