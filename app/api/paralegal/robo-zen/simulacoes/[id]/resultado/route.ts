// GET: resultado completo de uma simulação — uma linha por empresa
// mapeada, mais um resumo por motivo (equivalente a /api/resultado-completo
// do app Python, que gerava a planilha "Robo_Zen_resultado_*.xlsx").

import { NextResponse } from "next/server";
import { ehResposta, exigirAcessoParalegal } from "@/lib/robo-zen/guard";
import * as dbz from "@/lib/robo-zen/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await exigirAcessoParalegal();
  if (ehResposta(auth)) return auth;

  const simulacao = await dbz.obterSimulacao(params.id);
  if (!simulacao) {
    return NextResponse.json({ ok: false, erro: "Simulação não encontrada." }, { status: 404 });
  }

  const empresas = await dbz.listarEmpresasDaSimulacao(params.id);
  const resumo: Record<string, number> = {};
  for (const empresa of empresas) {
    const chave = empresa.motivo ?? "NÃO PROCESSADA";
    resumo[chave] = (resumo[chave] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    resultados: empresas.map((e) => ({
      codigo: e.codigo,
      empresa: e.nome,
      qtdDocumentosElegiveis: e.qtd_documentos_elegiveis,
      documentosElegiveis: e.documentos_elegiveis.map((d) => d.nome).join("; "),
      qtdDocumentosEscaneados: e.qtd_documentos_escaneados,
      documentosEscaneados: e.documentos_escaneados.join("; "),
      qtdDocumentosIgnorados: e.qtd_documentos_ignorados,
      documentosIgnorados: e.documentos_ignorados.join("; "),
      cnpj: e.cnpj ?? "",
      status: e.status ?? "",
      motivo: e.motivo ?? "",
      pronta: e.pronta,
    })),
    resumo,
  });
}
