// GET ?codigo=<código da empresa>&doc=<posição do documento na lista>
//
// Devolve o link de download (direto do SharePoint) de um contrato elegível
// que a simulação encontrou — é o que o botão "baixar contrato" da tabela de
// resultado usa. Somente leitura: não grava nada, não mexe no SharePoint.
//
// O documento NUNCA é identificado por um id vindo do navegador: o cliente só
// manda o código da empresa e a POSIÇÃO do documento na lista que a própria
// simulação gravou; o id do SharePoint é resolvido aqui, no servidor, a partir
// do banco. Assim ninguém consegue pedir um arquivo qualquer do SharePoint
// por esta rota, só os contratos que aquela simulação listou.

import { NextResponse } from "next/server";
import { ehResposta, exigirAcessoParalegal } from "@/lib/robo-zen/guard";
import * as dbz from "@/lib/robo-zen/db";
import { obterContextoGraph, obterLinkDownload, RoboZenSharePointErro } from "@/lib/robo-zen/empresas-sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await exigirAcessoParalegal();
  if (ehResposta(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const codigo = (searchParams.get("codigo") ?? "").trim();
  const doc = Number(searchParams.get("doc") ?? "0");
  if (!codigo || !Number.isInteger(doc) || doc < 0) {
    return NextResponse.json({ ok: false, erro: "Informe o código da empresa e o documento." }, { status: 400 });
  }

  const empresa = await dbz.obterEmpresaDaSimulacao(params.id, codigo);
  if (!empresa) {
    return NextResponse.json({ ok: false, erro: "Empresa não encontrada nesta simulação." }, { status: 404 });
  }
  const documento = empresa.documentos_elegiveis[doc];
  if (!documento) {
    return NextResponse.json({ ok: false, erro: "Documento não encontrado para esta empresa." }, { status: 404 });
  }

  try {
    const ctx = await obterContextoGraph();
    const link = await obterLinkDownload(ctx, documento.id);
    if (!link.url) {
      return NextResponse.json(
        { ok: false, erro: "O SharePoint não devolveu o link de download desse arquivo (ele pode ter sido movido ou apagado)." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, nome: documento.nome, url: link.url }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const status = e instanceof RoboZenSharePointErro ? e.status : 500;
    const mensagem = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        erro:
          status === 404
            ? "Esse arquivo não está mais no SharePoint (pode ter sido movido ou apagado depois da simulação)."
            : `Erro ao buscar o contrato no SharePoint: ${mensagem}`,
      },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
