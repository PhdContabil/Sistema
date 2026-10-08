import { NextResponse } from "next/server";
import { bloquearSemAcessoMei } from "@/lib/mei/guard";
import { q } from "@/lib/mei/questor-mei";

// Ficha completa de uma empresa MEI: cadastro detalhado + contatos/financeiro.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { cod: string } }) {
  const negado = await bloquearSemAcessoMei();
  if (negado) return negado;
  const cod = String(params.cod ?? "").replace(/\D/g, "");
  if (!cod) return NextResponse.json({ error: "Código inválido." }, { status: 400 });
  const [c, ct] = await Promise.all([
    q("/empresas/cadastro", { codigoempresa: cod, detalhado: "true" }),
    q("/empresas/contatos", { codigoempresa: cod }),
  ]);
  if (c.status !== 200) return NextResponse.json({ error: `Questor ${c.status}` }, { status: 502 });
  return NextResponse.json({ cadastro: (c.json.dados ?? [])[0] ?? null, contatos: ct.status === 200 ? ct.json : null });
}
