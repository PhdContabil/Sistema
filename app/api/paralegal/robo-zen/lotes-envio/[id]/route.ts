// GET: estado atual de um lote de envio real — sem avançar nada.

import { NextResponse } from "next/server";
import { ehResposta, exigirAcessoParalegal } from "@/lib/robo-zen/guard";
import * as dbz from "@/lib/robo-zen/db";
import { serializarLoteEnvio } from "@/lib/robo-zen/job-lote-envio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await exigirAcessoParalegal();
  if (ehResposta(auth)) return auth;

  const lote = await dbz.obterLoteEnvio(params.id);
  if (!lote) {
    return NextResponse.json({ ok: false, erro: "Lote de envio não encontrado." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, lote: serializarLoteEnvio(lote) });
}
