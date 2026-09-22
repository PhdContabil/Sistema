// POST { busca: string } — consulta uma empresa específica pelo nome
// (parcial) ou código, igual à seção 2 da interface original em Python
// (/api/consultar-empresa). Só leitura — nunca escreve nada no Questor.
//
// Estratégia (diferente do Python, que sempre fazia um crawl completo ao
// vivo antes de filtrar): primeiro tenta achar a empresa já mapeada pela
// simulação mais recente (rápido, só banco); se não achar (ou nunca rodou
// nenhuma simulação), cai para uma busca ao vivo no SharePoint — mais
// lenta (pode custear uma varredura de várias pastas), mas sempre com
// dado fresco. Ver aviso de performance em
// lib/robo-zen/empresas-sharepoint.ts (localizarEmpresa).

import { NextResponse } from "next/server";
import { ehResposta, exigirAcessoParalegal } from "@/lib/robo-zen/guard";
import * as dbz from "@/lib/robo-zen/db";
import { type Empresa, localizarEmpresa, obterContextoGraph, RoboZenSharePointErro } from "@/lib/robo-zen/empresas-sharepoint";
import { prepararDadosParaEnvio, type ResultadoPreparo } from "@/lib/robo-zen/preparar-empresa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function serializarResultado(resultado: ResultadoPreparo) {
  return {
    codigo: resultado.codigo,
    empresa: resultado.nome,
    qtdDocumentosElegiveis: resultado.qtdDocumentosElegiveis,
    qtdDocumentosEscaneados: resultado.qtdDocumentosEscaneados,
    qtdDocumentosIgnorados: resultado.qtdDocumentosIgnorados,
    cnpj: resultado.cnpj ?? "",
    status: resultado.status,
    motivo: resultado.motivo,
    pronta: resultado.pronta,
  };
}

export async function POST(req: Request) {
  const auth = await exigirAcessoParalegal();
  if (ehResposta(auth)) return auth;

  const corpo = await req.json().catch(() => ({}));
  const busca = typeof corpo?.busca === "string" ? corpo.busca.trim() : "";
  if (!busca) {
    return NextResponse.json({ ok: false, erro: "Digite o nome ou código da empresa." }, { status: 400 });
  }

  try {
    const [ultima] = await dbz.listarSimulacoesRecentes(1);
    if (ultima) {
      const empresaMapeada = await dbz.buscarEmpresaMapeada(ultima.id, busca);
      if (empresaMapeada?.processada) {
        return NextResponse.json({
          ok: true,
          origem: "simulacao",
          resultado: {
            codigo: empresaMapeada.codigo,
            empresa: empresaMapeada.nome,
            qtdDocumentosElegiveis: empresaMapeada.qtd_documentos_elegiveis,
            qtdDocumentosEscaneados: empresaMapeada.qtd_documentos_escaneados,
            qtdDocumentosIgnorados: empresaMapeada.qtd_documentos_ignorados,
            cnpj: empresaMapeada.cnpj ?? "",
            status: empresaMapeada.status ?? "",
            motivo: empresaMapeada.motivo ?? "",
            pronta: empresaMapeada.pronta,
          },
        });
      }
    }

    const ctx = await obterContextoGraph();
    const empresa: Empresa | null = await localizarEmpresa(ctx, busca);
    if (!empresa) {
      return NextResponse.json({ ok: false, erro: `Nenhuma empresa encontrada para "${busca}".` }, { status: 404 });
    }
    const resultado = await prepararDadosParaEnvio(ctx, empresa);
    return NextResponse.json({ ok: true, origem: "ao_vivo", resultado: serializarResultado(resultado) });
  } catch (e) {
    const status = e instanceof RoboZenSharePointErro ? e.status : 500;
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status });
  }
}
