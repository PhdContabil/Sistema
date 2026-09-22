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
 */

import { obterContextoGraph, baixarConteudo, type ContextoGraph } from "./empresas-sharepoint";
import { buscarCodigoCategoria, consultarCliente, uploadArquivo, importarDocumento, QuestorZenError } from "../questor-zen";
import * as dbz from "./db";

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
}

export function serializarLoteEnvio(row: dbz.LoteEnvioRow): EstadoLoteEnvio {
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
    erro: row.erro,
    pararPedido: row.parar_pedido,
    concluida: row.status === "concluida" || row.status === "erro" || row.status === "parada",
  };
}

function registrarErro(row: dbz.LoteEnvioRow, mensagem: string): string[] {
  const erros = [...row.erros, mensagem];
  return erros.slice(-50);
}

/** Avança UM pedaço do lote (uma empresa PRONTA por chamada). */
export async function avancarLoteEnvio(id: string): Promise<EstadoLoteEnvio> {
  const lote = await dbz.obterLoteEnvio(id);
  if (!lote) throw new Error("Lote de envio não encontrado.");

  if (lote.status === "concluida" || lote.status === "erro" || lote.status === "parada") {
    return serializarLoteEnvio(lote);
  }

  if (lote.parar_pedido) {
    const atualizada = await dbz.atualizarLoteEnvio(id, {
      status: "parada",
      terminado_em: new Date().toISOString(),
      empresa_atual: null,
    });
    return serializarLoteEnvio(atualizada);
  }

  const empresasProntas = await dbz.listarEmpresasProntas(lote.simulacao_origem_id);
  const indice = lote.cursor_processamento;
  if (indice >= empresasProntas.length) {
    const atualizada = await dbz.atualizarLoteEnvio(id, {
      status: "concluida",
      terminado_em: new Date().toISOString(),
      empresa_atual: null,
    });
    return serializarLoteEnvio(atualizada);
  }

  const empresa = empresasProntas[indice];
  const rotulo = `${empresa.nome} (código ${empresa.codigo})`;
  await dbz.atualizarLoteEnvio(id, { empresa_atual: rotulo });

  let ctx: ContextoGraph;
  let codigoCategoria: string;
  try {
    ctx = await obterContextoGraph();
    codigoCategoria = await buscarCodigoCategoria();
  } catch (e) {
    // Falha aqui é de configuração (credenciais do Graph ou do Questor Zen
    // ausentes/erradas) — fatal para o lote inteiro, igual ao Python.
    const atualizada = await dbz.atualizarLoteEnvio(id, {
      status: "erro",
      terminado_em: new Date().toISOString(),
      erro: e instanceof Error ? e.message : String(e),
    });
    return serializarLoteEnvio(atualizada);
  }

  const jaEnviados = await dbz.chavesJaEnviadas();
  const pendentes = empresa.documentos_elegiveis.filter(
    (doc) => !jaEnviados.has(dbz.chaveEnvio(empresa.codigo, doc.nome))
  );

  const patchBase = {
    empresas_processadas: lote.empresas_processadas + 1,
    cursor_processamento: indice + 1,
  };

  if (pendentes.length === 0) {
    const atualizada = await dbz.atualizarLoteEnvio(id, {
      ...patchBase,
      empresas_ja_enviadas: lote.empresas_ja_enviadas + 1,
      empresa_atual: rotulo,
    });
    return serializarLoteEnvio(atualizada);
  }

  let codigoCliente: string;
  try {
    const cliente = await consultarCliente(empresa.cnpj ?? "");
    codigoCliente = cliente.CodigoCliente;
  } catch (e) {
    const mensagem = `${empresa.nome} (código ${empresa.codigo}): erro ao buscar cliente (${
      e instanceof QuestorZenError ? e.message : String(e)
    })`;
    const atualizada = await dbz.atualizarLoteEnvio(id, {
      ...patchBase,
      documentos_com_erro: lote.documentos_com_erro + pendentes.length,
      erros: registrarErro(lote, mensagem),
      empresa_atual: rotulo,
    });
    return serializarLoteEnvio(atualizada);
  }

  let enviouAlgum = false;
  let documentosEnviados = 0;
  let documentosComErro = 0;
  let erros = lote.erros;

  for (const doc of pendentes) {
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
        empresaCodigo: empresa.codigo,
        empresaNome: empresa.nome,
        cnpj: empresa.cnpj ?? "",
        arquivoNome: doc.nome,
        documentoIdQuestor: documentoId,
        codigoCategoriaQuestor: codigoCategoria,
        codigoClienteQuestor: codigoCliente,
        enviadoPor: lote.criado_por,
      });
      enviouAlgum = true;
      documentosEnviados++;
    } catch (e) {
      const mensagem = `${empresa.nome} (código ${empresa.codigo}) - ${doc.nome}: ${
        e instanceof Error ? e.message : String(e)
      }`;
      erros = [...erros, mensagem].slice(-50);
      documentosComErro++;
    }
  }

  const atualizada = await dbz.atualizarLoteEnvio(id, {
    ...patchBase,
    empresas_enviadas: lote.empresas_enviadas + (enviouAlgum ? 1 : 0),
    documentos_enviados: lote.documentos_enviados + documentosEnviados,
    documentos_com_erro: lote.documentos_com_erro + documentosComErro,
    erros,
    empresa_atual: rotulo,
  });
  return serializarLoteEnvio(atualizada);
}
