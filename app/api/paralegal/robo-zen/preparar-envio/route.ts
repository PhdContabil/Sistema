// POST { busca } — Etapa 1/2 do envio real de UMA empresa. Confere de
// novo (na hora, dado fresco — sem cache de nenhuma simulação) se a
// empresa está PRONTA e, se estiver, guarda os dados prontos para
// cadastrar num token de uso único, devolvendo a lista de documentos para
// a pessoa conferir ANTES de qualquer coisa ser gravada no Questor. Não
// escreve nada no Questor — só GET. Equivalente a /api/preparar-envio.

import { NextResponse } from "next/server";
import { ehResposta, exigirAcessoParalegal } from "@/lib/robo-zen/guard";
import { localizarEmpresa, obterContextoGraph, RoboZenSharePointErro } from "@/lib/robo-zen/empresas-sharepoint";
import { prepararDadosParaEnvio } from "@/lib/robo-zen/preparar-empresa";
import * as dbz from "@/lib/robo-zen/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await exigirAcessoParalegal();
  if (ehResposta(auth)) return auth;

  const corpo = await req.json().catch(() => ({}));
  const busca = typeof corpo?.busca === "string" ? corpo.busca.trim() : "";
  if (!busca) {
    return NextResponse.json({ ok: false, erro: "Digite o nome ou código da empresa." }, { status: 400 });
  }

  try {
    const ctx = await obterContextoGraph();
    const empresa = await localizarEmpresa(ctx, busca);
    if (!empresa) {
      return NextResponse.json({ ok: false, erro: `Nenhuma empresa encontrada para "${busca}".` }, { status: 404 });
    }

    const resultado = await prepararDadosParaEnvio(ctx, empresa);
    // `pronta` já exclui quem tem tudo enviado ("JÁ ENVIADA…"); e só vão os
    // documentos que ainda NÃO foram ao Zen (`documentosParaEnviar`), nunca os
    // que já constam em robo_zen_envios — senão o contrato duplicaria no Zen.
    if (!resultado.pronta || resultado.documentosParaEnviar.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          erro:
            `Essa empresa não está pronta para envio agora (${resultado.motivo || "sem categoria"}) — ` +
            `não dá para enviar. Detalhe: ${resultado.status}`,
        },
        { status: 409 }
      );
    }

    const pendente = await dbz.criarEnvioPendente({
      empresaCodigo: empresa.codigo,
      empresaNome: empresa.nome,
      cnpj: resultado.cnpj ?? "",
      documentos: resultado.documentosParaEnviar,
      criadoPor: auth.email,
    });

    return NextResponse.json({
      ok: true,
      token: pendente.token,
      empresa: empresa.nome,
      codigo: empresa.codigo,
      cnpj: resultado.cnpj ?? "",
      documentos: resultado.documentosParaEnviar.map((d) => d.nome),
      // Já enviados antes (não vão de novo) — a tela pode mostrar pra pessoa entender.
      jaEnviados: resultado.documentosJaEnviados,
    });
  } catch (e) {
    const status = e instanceof RoboZenSharePointErro ? e.status : 500;
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status });
  }
}
