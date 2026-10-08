import { NextResponse } from "next/server";
import { bloquearSemAcessoMei } from "@/lib/mei/guard";
import { q } from "@/lib/mei/questor-mei";

// Clientes do financeiro (avulsos e empresas). ?q= nome (3+ letras), CPF/CNPJ ou código.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const negado = await bloquearSemAcessoMei();
  if (negado) return negado;
  const termo = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const dig = termo.replace(/\D/g, "");
  const params: Record<string, string> = { incluir_baixados: "true", incluir_empresas: "true" };
  if (dig.length >= 11) params.cpf_cnpj = dig;
  else if (/^\d+$/.test(termo)) params.codigo = termo;
  else if (termo.length >= 3) params.nome = termo;
  else return NextResponse.json({ dados: [] });
  const r = await q("/financeiro/clientes", params);
  if (r.status !== 200) return NextResponse.json({ error: `Questor ${r.status}` }, { status: 502 });
  return NextResponse.json({ dados: r.json.dados ?? [] });
}
