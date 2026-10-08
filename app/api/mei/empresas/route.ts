import { NextResponse } from "next/server";
import { bloquearSemAcessoMei } from "@/lib/mei/guard";
import { listaMEI } from "@/lib/mei/questor-mei";

// Lista da carteira MEI (Questor, regime MEI, códigos < 4000). ?atualizar=1 ignora o cache.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const negado = await bloquearSemAcessoMei();
  if (negado) return negado;
  try {
    const forcar = new URL(req.url).searchParams.get("atualizar") === "1";
    return NextResponse.json({ dados: await listaMEI(forcar) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar o Questor." }, { status: 502 });
  }
}
