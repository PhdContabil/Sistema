/**
 * Job incremental do envio real em LOTE ("Enviar de verdade TODAS as
 * prontas" — botão vermelho da seção 1). Porta de `_rodar_envio_real_lote`
 * (app.py, Python), adaptado ao mesmo padrão de avanço aos pedaços que a
 * simulação usa (ver job-simulacao.ts) — cada chamada de API processa UMA
 * empresa e devolve o progresso.
 *
 * Adaptação deliberada em relação ao Python: lá, o lote fazia
 * `listar_empresas()` + `_preparar_dados_para_envio()` do zero para TODAS
 * as ~770 empresas, sem aproveitar nenhuma simulação anterior — o que era
 * viável porque o processo rodava sem limite de tempo. Aqui, isso
 * custaria de novo o preço inteiro do OCR/extração de CNPJ (o mesmo custo
 * da simulação completa) dentro de funções serverless com tempo limitado.
 * Por isso o lote REAPROVEITA os resultados (CNPJ já extraído, documentos
 * elegíveis já identificados) de uma simulação já concluída — só refaz, na
 * hora do envio de verdade, o que precisa ser fresco de qualquer forma:
 * baixar os bytes de cada PDF (necessário para o upload) e reconferir o
 * cliente no Questor. Isso foi sinalizado explicitamente para a Júlia (não
 * é uma mudança de política silenciosa) — se preferir o comportamento
 * antigo (re-crawl 100% ao vivo por lote), dá para trocar depois.
 *
 * O QUE GARANTE "ENVIAR APENAS UMA VEZ" (o Zen não é idempotente):
 *  - O que já foi enviado é conferido empresa a empresa, no registro permanente
 *    (`robo_zen_envios`), na hora de enviar — não numa leitura única e sujeita ao
 *    corte de 1.000 linhas do Supabase.
 *  - Cada documento é RESERVADO antes de subir ao Zen (ver envio-seguro.ts): dois
 *    envios ao mesmo tempo, ou uma queda entre "o Zen gravou" e "o registro
 *    anotou", viram "conferir no Zen" em vez de um documento duplicado.
 *  - O banco só admite UM lote ativo (índice único parcial) e cada passo toma uma
 *    TRAVA atômica: vários navegadores/abas podem ficar chamando `continuar` — um
 *    passo roda por vez, nunca a mesma empresa em dois lugares.
 *
 * E O QUE FAZ RETOMAR DE ONDE PAROU: o progresso (posição na lista, contadores)
 * fica no banco a cada passo; qualquer navegador que abrir a tela encontra o lote
 * ativo e continua dele. Falha passageira do SharePoint/Zen/banco antes de tocar
 * numa empresa não avança a posição: o passo espera e tenta de novo (até 10 falhas
 * seguidas, como a varredura).
 */

import { obterContextoGraph, type ContextoGraph } from "./empresas-sharepoint";
import { buscarCodigoCategoria, consultarCliente, QuestorZenError } from "../questor-zen";
import * as dbz from "./db";
import { classificarEnvios } from "./novidades-envio";
import { enviarDocumentoSeguro } from "./envio-seguro";
import { depsEnvioSeguro } from "./envio-seguro-real";
import {
  ESPERA_ENTRE_TENTATIVAS_MS,
  MAX_FALHAS_SEGUIDAS_VARREDURA,
  ehErroTransitorio,
  lerMarcaDeFalha,
  marcaDeFalha,
} from "./transitorio";

/** Quanto tempo um passo segura a trava. Maior que o limite da função (60 s): se a
 * função morrer no meio, a trava vence sozinha logo depois. */
export const DURACAO_TRAVA_PASSO_MS = 90_000;

/** Depois disto, o passo não começa outro documento da mesma empresa (continua no
 * próximo passo) — a função morre aos 60 s e um documento no meio vira "conferir". */
export const ORCAMENTO_PASSO_MS = 30_000;

/** Empresas que já têm tudo enviado só custam uma leitura do registro: vários
 * por passo, pra um segundo lote não gastar uma chamada por empresa. */
export const MAX_EMPRESAS_JA_ENVIADAS_POR_PASSO = 30;

export interface EstadoLoteEnvio {
  id: string;
  status: dbz.StatusLoteEnvio;
  simulacaoOrigemId: string;
  totalEmpresasProntas: number;
  empresasProcessadas: number;
  empresasEnviadas: number;
  empresasJaEnviadas: number;
  documentosEnviados: number;
  documentosComErro: number;
  erros: string[];
  empresaAtual: string | null;
  iniciadoEm: string;
  terminadoEm: string | null;
  erro: string | null;
  pararPedido: boolean;
  concluida: boolean;
  /** Falhas passageiras seguidas (SharePoint/Zen/banco) — 0 quando está tudo bem. */
  falhasSeguidas: number;
  /** Quem iniciou o lote (a tela mostra "iniciado por …" a quem abre depois). */
  iniciadoPor: string;
}

export function serializarLoteEnvio(row: dbz.LoteEnvioRow): EstadoLoteEnvio {
  const marca = row.status === "processando" ? lerMarcaDeFalha(row.erro) : null;
  return {
    id: row.id,
    status: row.status,
    simulacaoOrigemId: row.simulacao_origem_id,
    totalEmpresasProntas: row.total_empresas_prontas,
    empresasProcessadas: row.empresas_processadas,
    empresasEnviadas: row.empresas_enviadas,
    empresasJaEnviadas: row.empresas_ja_enviadas,
    documentosEnviados: row.documentos_enviados,
    documentosComErro: row.documentos_com_erro,
    erros: row.erros,
    empresaAtual: row.empresa_atual,
    iniciadoEm: row.criado_em,
    terminadoEm: row.terminado_em,
    // A marca de falha passageira é bookkeeping, não um erro pra mostrar.
    erro: marca ? null : row.erro,
    pararPedido: row.parar_pedido,
    concluida: row.status === "concluida" || row.status === "erro" || row.status === "parada",
    falhasSeguidas: marca ? marca.n : 0,
    iniciadoPor: row.criado_por,
  };
}

function mensagemDe(e: unknown): string {
  if (e instanceof Error) return e.message || e.name || "erro sem mensagem";
  return String(e ?? "erro sem mensagem");
}

function acrescentarErro(erros: string[], mensagem: string): string[] {
  return [...erros, mensagem].slice(-50);
}

function rotuloDe(empresa: { nome: string; codigo: string }): string {
  return `${empresa.nome} (código ${empresa.codigo})`;
}

/**
 * Avança UM pedaço do lote (uma empresa com documento a enviar por chamada).
 *
 * Seguro de chamar de vários navegadores ao mesmo tempo: quem não conseguir a
 * trava do passo recebe o estado atual e só tenta de novo depois.
 */
export async function avancarLoteEnvio(id: string): Promise<EstadoLoteEnvio> {
  const atual = await dbz.obterLoteEnvio(id);
  if (!atual) throw new Error("Lote de envio não encontrado.");

  if (atual.status === "concluida" || atual.status === "erro" || atual.status === "parada") {
    return serializarLoteEnvio(atual);
  }

  const lote = await dbz.tomarPassoDoLote(id, Date.now(), DURACAO_TRAVA_PASSO_MS);
  if (!lote) {
    // Outro navegador está no meio de um passo (ou o lote esperando entre
    // tentativas): devolve o que há. A tela só espera e pergunta de novo.
    const recente = await dbz.obterLoteEnvio(id);
    return serializarLoteEnvio(recente ?? atual);
  }

  let manterTrava = false;
  try {
    return await executarPasso(lote);
  } catch (e) {
    // Falha PASSAGEIRA (SharePoint pediu pra esperar, Zen fora por instantes, rede,
    // banco piscando) antes de enviar qualquer coisa desta empresa: nada foi
    // tocado, então a posição não anda — espera e tenta de novo. Erro de verdade
    // (credencial, bug) segue pra cima e aparece na tela como sempre.
    if (!ehErroTransitorio(e)) throw e;
    manterTrava = true; // a trava vira a "espera entre tentativas"
    return await registrarFalhaPassageira(lote, e);
  } finally {
    if (!manterTrava) {
      await dbz.liberarPassoDoLote(id).catch(() => {
        // Sem liberar, a trava vence sozinha em DURACAO_TRAVA_PASSO_MS.
      });
    }
  }
}

async function registrarFalhaPassageira(lote: dbz.LoteEnvioRow, e: unknown): Promise<EstadoLoteEnvio> {
  const n = (lerMarcaDeFalha(lote.erro)?.n ?? 0) + 1;
  const mensagem = mensagemDe(e);
  if (n >= MAX_FALHAS_SEGUIDAS_VARREDURA) {
    const atualizada = await dbz.atualizarLoteEnvio(lote.id, {
      status: "erro",
      terminado_em: new Date().toISOString(),
      empresa_atual: null,
      passo_ate: null,
      erro:
        `Parei depois de ${n} falhas seguidas (SharePoint, Zen ou banco sem responder). Última: ${mensagem}. ` +
        "O que já foi enviado está no registro; é só iniciar o envio de novo quando estabilizar.",
    });
    return serializarLoteEnvio(atualizada);
  }
  const agora = Date.now();
  const atualizada = await dbz.atualizarLoteEnvio(lote.id, {
    erro: marcaDeFalha(n, agora, mensagem),
    passo_ate: new Date(agora + ESPERA_ENTRE_TENTATIVAS_MS).toISOString(),
  });
  return serializarLoteEnvio(atualizada);
}

async function executarPasso(lote: dbz.LoteEnvioRow): Promise<EstadoLoteEnvio> {
  const id = lote.id;
  const inicio = Date.now();
  // Voltou a funcionar: a marca de "falha N de 10" some junto com este passo.
  const limparMarca: Partial<dbz.LoteEnvioRow> = lerMarcaDeFalha(lote.erro) ? { erro: null } : {};

  if (lote.parar_pedido) {
    const atualizada = await dbz.atualizarLoteEnvio(id, {
      status: "parada",
      terminado_em: new Date().toISOString(),
      empresa_atual: null,
      ...limparMarca,
    });
    return serializarLoteEnvio(atualizada);
  }

  const empresasProntas = await dbz.listarEmpresasProntas(lote.simulacao_origem_id);

  let indice = lote.cursor_processamento;
  let processadas = lote.empresas_processadas;
  let jaEnviadas = lote.empresas_ja_enviadas;
  let ultimoRotulo = lote.empresa_atual;

  // 1) Pula as empresas que já têm tudo no registro (só leitura do banco — sem
  //    tocar no SharePoint nem no Zen) até achar uma com documento a enviar.
  let empresa: dbz.SimulacaoEmpresaRow | null = null;
  let enviosDaEmpresa: Awaited<ReturnType<typeof dbz.enviosDaEmpresa>> = [];
  let pendentes: dbz.DocumentoRef[] = [];
  let puladas = 0;
  while (indice < empresasProntas.length && puladas < MAX_EMPRESAS_JA_ENVIADAS_POR_PASSO) {
    const candidata = empresasProntas[indice];
    // Falha de leitura PROPAGA: sem saber o que já foi enviado, nada é enviado.
    const envios = await dbz.enviosDaEmpresa(candidata.codigo);
    const classificacao = classificarEnvios(candidata.documentos_elegiveis, envios);
    if (classificacao.novos.length > 0) {
      empresa = candidata;
      enviosDaEmpresa = envios;
      pendentes = classificacao.novos;
      break;
    }
    indice++;
    processadas++;
    jaEnviadas++;
    puladas++;
    ultimoRotulo = rotuloDe(candidata);
  }

  if (!empresa) {
    // Só havia empresas já enviadas neste pedaço — ou a lista acabou.
    const acabou = indice >= empresasProntas.length;
    const atualizada = await dbz.atualizarLoteEnvio(id, {
      cursor_processamento: indice,
      empresas_processadas: processadas,
      empresas_ja_enviadas: jaEnviadas,
      empresa_atual: acabou ? null : ultimoRotulo,
      ...(acabou ? { status: "concluida" as const, terminado_em: new Date().toISOString() } : {}),
      ...limparMarca,
    });
    return serializarLoteEnvio(atualizada);
  }

  const rotulo = rotuloDe(empresa);
  const progresso = { cursor_processamento: indice, empresas_processadas: processadas, empresas_ja_enviadas: jaEnviadas };

  // 2) Credenciais do Graph e do Zen.
  let ctx: ContextoGraph;
  let codigoCategoria: string;
  try {
    ctx = await obterContextoGraph();
    codigoCategoria = await buscarCodigoCategoria();
  } catch (e) {
    if (ehErroTransitorio(e)) throw e;
    // Falha aqui é de configuração (credenciais do Graph ou do Questor Zen
    // ausentes/erradas) — fatal para o lote inteiro, igual ao Python.
    const atualizada = await dbz.atualizarLoteEnvio(id, {
      ...progresso,
      status: "erro",
      terminado_em: new Date().toISOString(),
      empresa_atual: rotulo,
      erro: mensagemDe(e),
    });
    return serializarLoteEnvio(atualizada);
  }

  // 3) O cliente no Zen.
  let codigoCliente: string;
  try {
    const cliente = await consultarCliente(empresa.cnpj ?? "");
    codigoCliente = cliente.CodigoCliente;
  } catch (e) {
    if (ehErroTransitorio(e)) throw e; // Zen fora por instantes: nada foi tocado nesta empresa
    const mensagem = `${rotulo}: erro ao buscar cliente (${e instanceof QuestorZenError ? e.message : mensagemDe(e)})`;
    const atualizada = await dbz.atualizarLoteEnvio(id, {
      ...progresso,
      cursor_processamento: indice + 1,
      empresas_processadas: processadas + 1,
      documentos_com_erro: lote.documentos_com_erro + pendentes.length,
      erros: acrescentarErro(lote.erros, mensagem),
      empresa_atual: rotulo,
      ...limparMarca,
    });
    return serializarLoteEnvio(atualizada);
  }

  // 4) Os documentos — um por vez, cada um reservado antes de subir.
  const deps = depsEnvioSeguro({
    ctx,
    codigoCategoria,
    codigoCliente,
    empresa: { codigo: empresa.codigo, nome: empresa.nome, cnpj: empresa.cnpj ?? "" },
    enviadoPor: lote.criado_por,
  });

  let documentosEnviados = 0;
  let documentosComErro = 0;
  let erros = lote.erros;
  let terminouEmpresa = true;

  for (let i = 0; i < pendentes.length; i++) {
    if (i > 0 && Date.now() - inicio > ORCAMENTO_PASSO_MS) {
      terminouEmpresa = false; // o resto fica pro próximo passo (a mesma empresa)
      break;
    }
    const doc = pendentes[i];
    const r = await enviarDocumentoSeguro(deps, empresa.codigo, doc);
    switch (r.situacao) {
      case "enviado":
        documentosEnviados++;
        if (r.aviso) erros = acrescentarErro(erros, `ATENÇÃO — ${rotulo} - ${doc.nome}: ${r.aviso}`);
        break;
      case "ja_enviado":
        // Outro envio terminou esse documento nesse meio tempo: nada a fazer.
        break;
      case "bloqueado":
        documentosComErro++;
        erros = acrescentarErro(erros, `${rotulo} - ${doc.nome}: ${r.mensagem}`);
        break;
      case "falhou":
        documentosComErro++;
        erros = acrescentarErro(erros, `${rotulo} - ${doc.nome}: ${r.mensagem}`);
        break;
    }
  }

  const base = {
    documentos_enviados: lote.documentos_enviados + documentosEnviados,
    documentos_com_erro: lote.documentos_com_erro + documentosComErro,
    erros,
    empresa_atual: rotulo,
    ...limparMarca,
  };

  if (!terminouEmpresa) {
    // A empresa continua no próximo passo: a posição não anda e ela ainda não
    // conta como processada/enviada (isso acontece no passo que a termina).
    const atualizada = await dbz.atualizarLoteEnvio(id, { ...progresso, ...base });
    return serializarLoteEnvio(atualizada);
  }

  // "Enviada por este lote" = subiu algo agora OU já havia envio dela feito depois
  // que o lote começou (passos anteriores da mesma empresa).
  const inicioDoLote = Date.parse(lote.criado_em);
  const enviadaNesteLote =
    documentosEnviados > 0 ||
    enviosDaEmpresa.some((e) => {
      const quando = Date.parse(e.enviado_em);
      return Number.isFinite(quando) && Number.isFinite(inicioDoLote) && quando >= inicioDoLote;
    });

  const atualizada = await dbz.atualizarLoteEnvio(id, {
    ...progresso,
    ...base,
    cursor_processamento: indice + 1,
    empresas_processadas: processadas + 1,
    empresas_enviadas: lote.empresas_enviadas + (enviadaNesteLote ? 1 : 0),
  });
  return serializarLoteEnvio(atualizada);
}
