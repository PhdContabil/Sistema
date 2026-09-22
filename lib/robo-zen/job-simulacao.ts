/**
 * Job incremental da simulação ("Rodar simulação completa" — modo
 * leitura). Cada chamada de `avancarSimulacao` processa UM pedaço
 * (uma pasta de 1º nível na fase de mapeamento, ou uma empresa na fase de
 * processamento) e devolve o estado atual — o navegador chama isso
 * repetidamente (polling) até `concluida=true`, exatamente como a barra de
 * progresso da interface original em Python, só que aqui cada "passo" é
 * uma invocação serverless independente em vez de uma iteração de loop
 * numa thread de longa duração.
 */

import { type ContextoGraph, type Empresa, obterContextoGraph, processarPastaTopo } from "./empresas-sharepoint";
import { prepararDadosParaEnvio } from "./preparar-empresa";
import * as dbz from "./db";

export interface EstadoSimulacao {
  id: string;
  status: dbz.StatusSimulacao;
  pastasMapeadas: number;
  totalPastas: number;
  totalEmpresas: number;
  empresasProcessadas: number;
  empresasProntas: number;
  empresaAtual: string | null;
  iniciadoEm: string | null;
  terminadoEm: string | null;
  erro: string | null;
  pararPedido: boolean;
  concluida: boolean;
}

export function serializarSimulacao(row: dbz.SimulacaoRow): EstadoSimulacao {
  return {
    id: row.id,
    status: row.status,
    pastasMapeadas: row.pastas_mapeadas,
    totalPastas: row.pastas_raiz.length,
    totalEmpresas: row.total_empresas,
    empresasProcessadas: row.empresas_processadas,
    empresasProntas: row.empresas_prontas,
    empresaAtual: row.empresa_atual,
    iniciadoEm: row.iniciado_em,
    terminadoEm: row.terminado_em,
    erro: row.erro,
    pararPedido: row.parar_pedido,
    concluida: row.status === "concluida" || row.status === "erro" || row.status === "parada",
  };
}

// Quantas pastas de 1º nível mapear por chamada de API. 1 é o valor mais
// seguro contra o maxDuration da Vercel (uma pasta "Grupo ..." grande pode
// ter dezenas de subpastas) — o polling do navegador (a cada ~1500ms, como
// no app original) chama de novo rapidamente, então a experiência
// continua fluida mesmo processando uma de cada vez.
const PASTAS_POR_CHAMADA = 1;

/** Avança UM pedaço do job. Chamado repetidamente pelo polling do
 * navegador até `concluida=true`. */
export async function avancarSimulacao(id: string): Promise<EstadoSimulacao> {
  const simulacao = await dbz.obterSimulacao(id);
  if (!simulacao) throw new Error("Simulação não encontrada.");

  if (simulacao.status === "concluida" || simulacao.status === "erro" || simulacao.status === "parada") {
    return serializarSimulacao(simulacao);
  }

  if (simulacao.parar_pedido) {
    const atualizada = await dbz.atualizarSimulacao(id, {
      status: "parada",
      terminado_em: new Date().toISOString(),
      empresa_atual: null,
    });
    return serializarSimulacao(atualizada);
  }

  let ctx: ContextoGraph;
  try {
    ctx = await obterContextoGraph();
  } catch (e) {
    const atualizada = await dbz.atualizarSimulacao(id, {
      status: "erro",
      terminado_em: new Date().toISOString(),
      erro: e instanceof Error ? e.message : String(e),
    });
    return serializarSimulacao(atualizada);
  }

  try {
    if (simulacao.status === "mapeando") {
      return await avancarMapeamento(ctx, simulacao);
    }
    return await avancarProcessamento(ctx, simulacao);
  } catch (e) {
    const atualizada = await dbz.atualizarSimulacao(id, {
      status: "erro",
      terminado_em: new Date().toISOString(),
      erro: e instanceof Error ? e.message : String(e),
    });
    return serializarSimulacao(atualizada);
  }
}

async function avancarMapeamento(ctx: ContextoGraph, simulacao: dbz.SimulacaoRow): Promise<EstadoSimulacao> {
  const pastas = simulacao.pastas_raiz;
  const inicio = simulacao.pastas_mapeadas;
  const fim = Math.min(inicio + PASTAS_POR_CHAMADA, pastas.length);

  let empresaAtual: string | null = simulacao.empresa_atual;
  for (let i = inicio; i < fim; i++) {
    const pastaTopo = pastas[i];
    empresaAtual = `Mapeando: ${pastaTopo.name}`;
    const resultado = await processarPastaTopo(ctx, pastaTopo);
    if (resultado.empresas.length > 0) {
      await dbz.inserirEmpresasMapeadas(
        simulacao.id,
        resultado.empresas.map((e) => ({
          codigo: e.codigo,
          nome: e.nome,
          pastaItemId: e.itemId,
          pastaCaminho: e.caminho,
          grupoNome: e.grupoNome,
        }))
      );
    }
  }

  const pastasMapeadas = fim;
  if (pastasMapeadas >= pastas.length) {
    const totalEmpresas = await dbz.contarEmpresasMapeadas(simulacao.id);
    const atualizada = await dbz.atualizarSimulacao(simulacao.id, {
      pastas_mapeadas: pastasMapeadas,
      status: "processando",
      total_empresas: totalEmpresas,
      empresa_atual: null,
    });
    return serializarSimulacao(atualizada);
  }

  const atualizada = await dbz.atualizarSimulacao(simulacao.id, {
    pastas_mapeadas: pastasMapeadas,
    empresa_atual: empresaAtual,
  });
  return serializarSimulacao(atualizada);
}

async function avancarProcessamento(ctx: ContextoGraph, simulacao: dbz.SimulacaoRow): Promise<EstadoSimulacao> {
  const proxima = await dbz.proximaEmpresaParaProcessar(simulacao.id);
  if (!proxima) {
    const atualizada = await dbz.atualizarSimulacao(simulacao.id, {
      status: "concluida",
      terminado_em: new Date().toISOString(),
      empresa_atual: null,
    });
    return serializarSimulacao(atualizada);
  }

  const empresa: Empresa = {
    nome: proxima.nome,
    codigo: proxima.codigo,
    itemId: proxima.pasta_item_id,
    caminho: proxima.pasta_caminho,
    grupoNome: proxima.grupo_nome,
  };
  const rotuloEmpresa = `${empresa.nome} (código ${empresa.codigo})`;

  // Marca "empresa atual" já no começo, antes do trabalho pesado (baixar
  // PDFs, OCR, consultar o Questor) — deixa o polling do navegador mostrar
  // o progresso em vez de ficar "parado" enquanto uma empresa demorada
  // (várias páginas escaneadas) está sendo processada.
  await dbz.atualizarSimulacao(simulacao.id, { empresa_atual: rotuloEmpresa });

  const resultado = await prepararDadosParaEnvio(ctx, empresa);

  await dbz.atualizarEmpresaSimulacao(proxima.id, {
    processada: true,
    pronta: resultado.pronta,
    motivo: resultado.motivo,
    status: resultado.status,
    cnpj: resultado.cnpj,
    qtd_documentos_elegiveis: resultado.qtdDocumentosElegiveis,
    documentos_elegiveis: resultado.documentosElegiveis,
    qtd_documentos_escaneados: resultado.qtdDocumentosEscaneados,
    documentos_escaneados: resultado.documentosEscaneados,
    qtd_documentos_ignorados: resultado.qtdDocumentosIgnorados,
    documentos_ignorados: resultado.documentosIgnorados,
    documento_cnpj_origem: resultado.documentoCnpjOrigem,
  });

  const empresasProcessadas = simulacao.empresas_processadas + 1;
  const empresasProntas = simulacao.empresas_prontas + (resultado.pronta ? 1 : 0);
  const concluidoAgora = empresasProcessadas >= simulacao.total_empresas;

  const atualizada = await dbz.atualizarSimulacao(simulacao.id, {
    empresas_processadas: empresasProcessadas,
    empresas_prontas: empresasProntas,
    cursor_processamento: empresasProcessadas,
    status: concluidoAgora ? "concluida" : "processando",
    terminado_em: concluidoAgora ? new Date().toISOString() : null,
    empresa_atual: concluidoAgora ? null : rotuloEmpresa,
  });
  return serializarSimulacao(atualizada);
}
