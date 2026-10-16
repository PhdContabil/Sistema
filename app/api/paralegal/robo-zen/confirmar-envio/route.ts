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
//
// Cada documento é RESERVADO antes de subir ao Zen (lib/robo-zen/envio-seguro.ts):
// se o envio em lote (ou outra pessoa) estiver mandando o mesmo documento nesse
// instante, só um dos dois manda — o outro recebe "já tem envio em andamento".

import { NextResponse } from "next/server";
import { ehResposta, exigirAcessoParalegal } from "@/lib/robo-zen/guard";
import { obterContextoGraph, RoboZenSharePointErro } from "@/lib/robo-zen/empresas-sharepoint";
import { buscarCodigoCategoria, consultarCliente, QuestorZenError } from "@/lib/questor-zen";
import * as dbz from "@/lib/robo-zen/db";
import { classificarEnvios } from "@/lib/robo-zen/novidades-envio";
import { enviarDocumentoSeguro, TEXTO_CONFERIR_NO_ZEN } from "@/lib/robo-zen/envio-seguro";
import { depsEnvioSeguro } from "@/lib/robo-zen/envio-seguro-real";

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

  // Última barreira contra duplicar no Zen: entre "preparar" e "confirmar"
  // podem passar até 15 minutos, e nesse intervalo alguém (ou o envio em lote)
  // pode ter mandado o mesmo documento. Confere o registro DESTA empresa de novo
  // na hora (e cada documento ainda é reservado antes de subir).
  let documentosAEnviar = pendente.documentos;
  try {
    const envios = await dbz.enviosDaEmpresa(pendente.empresa_codigo);
    documentosAEnviar = classificarEnvios(pendente.documentos, envios).novos;
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        erro:
          `Não consegui conferir o registro de envios (${e instanceof Error ? e.message : String(e)}) — por segurança ` +
          "nada foi enviado, para não duplicar no Zen. Consulte a empresa de novo e tente outra vez.",
      },
      { status: 503 }
    );
  }
  if (documentosAEnviar.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        erro:
          "Esses documentos já foram enviados ao Zen (consta no registro de envios) — nada foi enviado de novo. " +
          "Consulte a empresa para ver o que ainda falta.",
      },
      { status: 409 }
    );
  }

  const deps = depsEnvioSeguro({
    ctx,
    codigoCategoria,
    codigoCliente,
    empresa: { codigo: pendente.empresa_codigo, nome: pendente.empresa_nome, cnpj: pendente.cnpj },
    enviadoPor: auth.email,
  });

  const enviados: { arquivo: string; documentoId: string }[] = [];
  const avisos: string[] = [];
  let erroNoMeio: string | null = null;
  let bloqueado = false;
  let incerto = false;
  let indiceDaFalha = documentosAEnviar.length;

  for (let i = 0; i < documentosAEnviar.length; i++) {
    const doc = documentosAEnviar[i];
    const r = await enviarDocumentoSeguro(deps, pendente.empresa_codigo, doc);
    if (r.situacao === "enviado") {
      enviados.push({ arquivo: doc.nome, documentoId: r.documentoId });
      if (r.aviso) avisos.push(`${doc.nome}: ${r.aviso}`);
      continue;
    }
    if (r.situacao === "ja_enviado") continue; // outro envio terminou esse documento agora há pouco
    erroNoMeio = r.mensagem;
    bloqueado = r.situacao === "bloqueado";
    incerto = r.situacao === "falhou" && r.incerto;
    indiceDaFalha = i;
    break;
  }

  if (erroNoMeio) {
    const faltaram = documentosAEnviar.slice(indiceDaFalha).map((d) => d.nome);
    const avisoParcial =
      enviados.length > 0
        ? `${enviados.length} documento(s) já tinham sido gravados com sucesso antes deste erro (já estão no ` +
          `registro de envios) — faltou: ${faltaram.join(", ")}.`
        : "Nenhum documento chegou a ser gravado.";
    const conselho =
      incerto || bloqueado
        ? `Confira no Questor Zen (CRM > Clientes > ${pendente.empresa_nome} > Documentos) antes de tentar enviar ` +
          "de novo, para não duplicar."
        : "Pode tentar de novo: o que já foi enviado não é enviado outra vez.";
    return NextResponse.json(
      {
        ok: false,
        erro: `Erro ao cadastrar no Questor Zen: ${erroNoMeio}\n\n${avisoParcial} ${conselho}`,
        ...(bloqueado || incerto ? { conferirNoZen: TEXTO_CONFERIR_NO_ZEN } : {}),
      },
      { status: bloqueado ? 409 : 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    empresa: pendente.empresa_nome,
    cnpj: pendente.cnpj,
    documentos: enviados,
    ...(avisos.length > 0 ? { avisos } : {}),
  });
}
