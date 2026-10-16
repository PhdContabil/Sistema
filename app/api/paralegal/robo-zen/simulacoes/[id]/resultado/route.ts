// GET: resultado completo de uma simulação — uma linha por empresa
// mapeada, mais um resumo por motivo (equivalente a /api/resultado-completo
// do app Python, que gerava a planilha "Robo_Zen_resultado_*.xlsx").
//
// A situação de ENVIO é calculada AO VIVO: o resultado guardado é o retrato do
// momento da varredura, e depois dele o envio em lote manda documentos ao Zen
// sem mudar esse retrato. Aqui cada linha PRONTA é cruzada com o registro de
// envios (lib/robo-zen/situacao-envio.ts) — "ENVIADA" pro que já foi, "ENVIO
// PARCIAL" pro que falta uma parte — sem alterar nada no banco.

import { NextResponse } from "next/server";
import { ehResposta, exigirAcessoParalegal } from "@/lib/robo-zen/guard";
import * as dbz from "@/lib/robo-zen/db";
import { agruparPorEmpresa, aplicarSituacaoDeEnvio } from "@/lib/robo-zen/situacao-envio";

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

  // Registro de envios + reservas que sobraram. Se o registro não puder ser lido, o
  // resultado sai como estava (retrato da varredura) e a resposta avisa — o envio
  // em si continua protegido, ele não depende desta tela.
  let situacaoDeEnvioConferida = true;
  let enviosPorEmpresa = new Map<string, Awaited<ReturnType<typeof dbz.todosOsEnvios>>>();
  let reservasPorEmpresa = new Map<string, Awaited<ReturnType<typeof dbz.listarReservasEnvio>>>();
  try {
    enviosPorEmpresa = agruparPorEmpresa(await dbz.todosOsEnvios());
  } catch {
    situacaoDeEnvioConferida = false;
  }
  try {
    reservasPorEmpresa = agruparPorEmpresa(await dbz.listarReservasEnvio());
  } catch {
    // Sem a tabela de reservas (migração ainda não aplicada): só não mostra "interrompido".
  }
  const agora = Date.now();

  const linhas = empresas.map((e) => {
    const base = {
      codigo: e.codigo,
      empresa: e.nome,
      qtdDocumentosElegiveis: e.qtd_documentos_elegiveis,
      documentosElegiveis: e.documentos_elegiveis.map((d) => d.nome).join("; "),
      // Mesma ordem de `documentos_elegiveis` — a posição aqui é o `doc=` que o
      // botão "baixar contrato" manda pra rota .../contrato (só os nomes vão
      // pro navegador; o id do SharePoint fica no servidor).
      documentos: e.documentos_elegiveis.map((d) => d.nome),
      qtdDocumentosEscaneados: e.qtd_documentos_escaneados,
      documentosEscaneados: e.documentos_escaneados.join("; "),
      qtdDocumentosIgnorados: e.qtd_documentos_ignorados,
      documentosIgnorados: e.documentos_ignorados.join("; "),
      cnpj: e.cnpj ?? "",
      status: e.status ?? "",
      motivo: e.motivo ?? "",
      pronta: e.pronta,
    };
    return aplicarSituacaoDeEnvio(
      base,
      enviosPorEmpresa.get(e.codigo) ?? [],
      reservasPorEmpresa.get(e.codigo) ?? [],
      agora
    );
  });

  const resumo: Record<string, number> = {};
  for (const linha of linhas) {
    const chave = linha.motivo || "NÃO PROCESSADA";
    resumo[chave] = (resumo[chave] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    resultados: linhas,
    resumo,
    situacaoDeEnvioConferida,
  });
}
