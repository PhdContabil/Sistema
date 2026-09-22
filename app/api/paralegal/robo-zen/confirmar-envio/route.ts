// POST { token } — Etapa 2/2 do envio real de UMA empresa. Só roda depois
// que a pessoa já viu a lista de documentos (etapa 1) e confirmou na
// tela. AQUI sim grava de verdade no Questor Zen. Cada token só funciona
// uma vez (consumido atomicamente por lib/robo-zen/db.ts). Equivalente a
// /api/confirmar-envio.
//
// Documento por documento (em vez de usar cadastrarContratos direto),
// porque cada documento gravado com sucesso já é registrado na hora no
// robo_zen_envios (auditoria permanente) — assim, se o lote falhar no
// meio (rede caiu etc.), os documentos já gravados não ficam invisíveis:
// tanto o banco quanto a resposta mostram exatamente quais foram.

import { NextResponse } from "next/server";
import { ehResposta, exigirAcessoParalegal } from "@/lib/robo-zen/guard";
import { baixarConteudo, obterContextoGraph, RoboZenSharePointErro } from "@/lib/robo-zen/empresas-sharepoint";
import { buscarCodigoCategoria, consultarCliente, importarDocumento, QuestorZenError, uploadArquivo } from "@/lib/questor-zen";
import * as dbz from "@/lib/robo-zen/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await exigirAcessoParalegal();
  if (ehResposta(auth)) return auth;

  const corpo = await req.json().catch(() => ({}));
  const token = typeof corpo?.token === "string" ? corpo.token.trim() : "";
  if (!token) {
    return NextResponse.json({ ok: false, erro: "Token de confirmação ausente." }, { status: 400 });
  }

  const pendente = await dbz.consumirEnvioPendente(token);
  if (!pendente) {
    return NextResponse.json(
      {
        ok: false,
        erro:
          "Essa confirmação expirou ou já foi usada (cada confirmação só vale uma vez, e vence depois de 15 " +
          "minutos). Consulte a empresa de novo e clique em enviar mais uma vez.",
      },
      { status: 410 }
    );
  }

  let ctx;
  let codigoCategoria: string;
  let codigoCliente: string;
  try {
    ctx = await obterContextoGraph();
    codigoCategoria = await buscarCodigoCategoria();
    const cliente = await consultarCliente(pendente.cnpj);
    codigoCliente = cliente.CodigoCliente;
  } catch (e) {
    const status = e instanceof QuestorZenError ? e.status : e instanceof RoboZenSharePointErro ? e.status : 500;
    return NextResponse.json(
      { ok: false, erro: `Erro ao preparar o envio no Questor Zen: ${e instanceof Error ? e.message : String(e)}` },
      { status }
    );
  }

  const enviados: { arquivo: string; documentoId: string }[] = [];
  let erroNoMeio: string | null = null;

  for (const doc of pendente.documentos) {
    try {
      const bytes = await baixarConteudo(ctx, doc.id);
      const codigoArquivo = await uploadArquivo(doc.nome, bytes);
      const tituloSemExtensao = doc.nome.replace(/\.[^./\\]+$/, "");
      const documentoId = await importarDocumento({
        codigoCategoria,
        codigoCliente,
        codigoArquivo,
        titulo: tituloSemExtensao,
      });
      await dbz.registrarEnvio({
        empresaCodigo: pendente.empresa_codigo,
        empresaNome: pendente.empresa_nome,
        cnpj: pendente.cnpj,
        arquivoNome: doc.nome,
        documentoIdQuestor: documentoId,
        codigoCategoriaQuestor: codigoCategoria,
        codigoClienteQuestor: codigoCliente,
        enviadoPor: auth.email,
      });
      enviados.push({ arquivo: doc.nome, documentoId });
    } catch (e) {
      erroNoMeio = e instanceof Error ? e.message : String(e);
      break;
    }
  }

  if (erroNoMeio) {
    const faltaram = pendente.documentos.slice(enviados.length).map((d) => d.nome);
    const avisoParcial =
      enviados.length > 0
        ? `${enviados.length} documento(s) já tinham sido gravados com sucesso antes deste erro (já estão no ` +
          `registro de envios) — faltou: ${faltaram.join(", ")}.`
        : "Nenhum documento chegou a ser gravado.";
    return NextResponse.json(
      {
        ok: false,
        erro:
          `Erro ao cadastrar no Questor Zen: ${erroNoMeio}\n\n${avisoParcial} Confira no Questor Zen ` +
          `(CRM > Clientes > ${pendente.empresa_nome} > Documentos) antes de tentar enviar de novo, para não duplicar.`,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    empresa: pendente.empresa_nome,
    cnpj: pendente.cnpj,
    documentos: enviados,
  });
}
