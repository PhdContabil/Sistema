// POST: avança UM pedaço do envio real em lote (uma empresa PRONTA por
// chamada) — o navegador chama repetidamente (polling) até
// `concluida=true`. Ver lib/robo-zen/job-lote-envio.ts.

import { NextResponse } from "next/server";
import { ehResposta, exigirAcessoParalegal } from "@/lib/robo-zen/guard";
import { avancarLoteEnvio } from "@/lib/robo-zen/job-lote-envio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await exigirAcessoParalegal();
  if (ehResposta(auth)) return auth;

  try {
    const estado = await avancarLoteEnvio(params.id);
    return NextResponse.json({ ok: true, lote: estado });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    const status = mensagem.includes("não encontrado") ? 404 : 500;
    return NextResponse.json({ ok: false, erro: mensagem }, { status });
  }
}
