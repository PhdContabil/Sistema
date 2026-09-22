// POST: pede para parar um envio em lote em andamento. Só marca o pedido
// — quem efetivamente para é a próxima chamada a /continuar. Parar (e
// retomar depois, criando um novo lote a partir da mesma simulação) nunca
// duplica nada: a checagem de "já enviado antes" (robo_zen_envios) é
// sempre consultada de novo a cada empresa.

import { NextResponse } from "next/server";
import { ehResposta, exigirAcessoParalegal } from "@/lib/robo-zen/guard";
import * as dbz from "@/lib/robo-zen/db";
import { serializarLoteEnvio } from "@/lib/robo-zen/job-lote-envio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await exigirAcessoParalegal();
  if (ehResposta(auth)) return auth;

  const lote = await dbz.obterLoteEnvio(params.id);
  if (!lote) {
    return NextResponse.json({ ok: false, erro: "Lote de envio não encontrado." }, { status: 404 });
  }
  if (lote.status !== "processando") {
    return NextResponse.json({ ok: false, erro: "Não tem envio em lote rodando." }, { status: 409 });
  }

  const atualizada = await dbz.atualizarLoteEnvio(params.id, { parar_pedido: true });
  return NextResponse.json({ ok: true, lote: serializarLoteEnvio(atualizada) });
}
