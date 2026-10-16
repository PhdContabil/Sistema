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
import { MOTIVO_ERRO, prepararDadosParaEnvio, type ResultadoPreparo } from "./preparar-empresa";
import {
  ehErroTransitorio,
  ESPERA_ENTRE_TENTATIVAS_MS,
  lerMarcaDeFalha,
  marcaDeFalha,
  MAX_FALHAS_SEGUIDAS_VARREDURA,
  MAX_TENTATIVAS_EMPRESA,
  MOTIVO_SHAREPOINT_INSTAVEL,
  tentativasDaEmpresa,
} from "./transitorio";
import * as dbz from "./db";

/** O que o passo precisa do resultado de uma empresa (o de `prepararDadosParaEnvio`
 * tem mais campos; este recorte também serve pro "desisti" montado aqui). */
type ResultadoLinha = Pick<
  ResultadoPreparo,
  | "pronta"
  | "motivo"
  | "status"
  | "cnpj"
  | "qtdDocumentosElegiveis"
  | "documentosElegiveis"
  | "qtdDocumentosEscaneados"
  | "documentosEscaneados"
  | "qtdDocumentosIgnorados"
  | "documentosIgnorados"
  | "documentoCnpjOrigem"
  | "buscaIncompleta"
>;

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

  // Houve uma falha passageira há pouco (SharePoint/rede/banco fora do ar por
  // instantes)? Espera um pouco antes de tentar de novo — o navegador e o
  // agendador chamam este passo sem parar, e repetir em segundos não adianta.
  const falhaAnterior = lerMarcaDeFalha(simulacao.erro);
  if (falhaAnterior && Date.now() - falhaAnterior.quando < ESPERA_ENTRE_TENTATIVAS_MS) {
    return serializarSimulacao(simulacao);
  }

  try {
    const estado = await executarPasso(simulacao);
    // Passo funcionou: some a marca de "falha seguida".
    if (falhaAnterior) await dbz.atualizarSimulacao(id, { erro: "" }).catch(() => {});
    return estado;
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    // Falha passageira: NÃO derruba a varredura — fica como está e o próximo passo
    // tenta de novo. Só desiste depois de várias falhas SEGUIDAS.
    if (ehErroTransitorio(e)) {
      const n = (falhaAnterior?.n ?? 0) + 1;
      if (n < MAX_FALHAS_SEGUIDAS_VARREDURA) {
        const atualizada = await dbz.atualizarSimulacao(id, {
          erro: marcaDeFalha(n, Date.now(), mensagem || "falha sem mensagem"),
          empresa_atual: `Aguardando o SharePoint/banco responder — tentando de novo (falha ${n} de ${MAX_FALHAS_SEGUIDAS_VARREDURA})`,
        });
        return serializarSimulacao(atualizada);
      }
      const atualizada = await dbz.atualizarSimulacao(id, {
        status: "erro",
        terminado_em: new Date().toISOString(),
        erro: `Parei depois de ${n} falhas seguidas: ${mensagem || "falha sem mensagem"}`,
      });
      return serializarSimulacao(atualizada);
    }
    const atualizada = await dbz.atualizarSimulacao(id, {
      status: "erro",
      terminado_em: new Date().toISOString(),
      erro: mensagem,
    });
    return serializarSimulacao(atualizada);
  }
}

async function executarPasso(simulacao: dbz.SimulacaoRow): Promise<EstadoSimulacao> {
  const ctx = await obterContextoGraph();
  if (simulacao.status === "mapeando") {
    return await avancarMapeamento(ctx, simulacao);
  }
  return await avancarProcessamento(ctx, simulacao);
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
    // Fecha com os números contados nas linhas (cura qualquer contador que um
    // passo concorrente tenha deixado para trás).
    const { processadas, prontas } = await dbz.contarProgressoSimulacao(simulacao.id);
    const atualizada = await dbz.atualizarSimulacao(simulacao.id, {
      empresas_processadas: processadas,
      empresas_prontas: prontas,
      cursor_processamento: processadas,
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
  // Esta empresa falhou de forma passageira há pouco (SharePoint fora do ar ou
  // pedindo pra esperar)? Dá um tempo antes de insistir — o navegador e o agendador
  // chamam este passo sem parar.
  const tentativasAntes = tentativasDaEmpresa(proxima.motivo, proxima.status);
  if (tentativasAntes > 0 && Date.now() - Date.parse(proxima.atualizado_em) < ESPERA_ENTRE_TENTATIVAS_MS) {
    return serializarSimulacao(simulacao);
  }

  await dbz.atualizarSimulacao(simulacao.id, { empresa_atual: rotuloEmpresa });

  let resultado: ResultadoLinha;
  try {
    resultado = await prepararDadosParaEnvio(ctx, empresa);
  } catch (e) {
    if (!ehErroTransitorio(e)) throw e;
    // Falha PASSAGEIRA (429/502/503/504, rede): não diz nada sobre a empresa. Ela fica
    // como não processada e o próximo passo tenta de novo — em vez de virar um ERRO
    // falso (ou de derrubar a varredura). Só depois de várias tentativas seguidas ela
    // é dada como erro e a varredura segue pra próxima.
    const n = tentativasAntes + 1;
    const mensagem = (e instanceof Error ? e.message : String(e)) || "falha sem mensagem";
    if (n < MAX_TENTATIVAS_EMPRESA) {
      await dbz.atualizarEmpresaSimulacao(proxima.id, {
        processada: false,
        pronta: false,
        motivo: MOTIVO_SHAREPOINT_INSTAVEL,
        status: `SHAREPOINT INSTÁVEL (tentativa ${n} de ${MAX_TENTATIVAS_EMPRESA}): ${mensagem}`,
      });
      const atualizada = await dbz.atualizarSimulacao(simulacao.id, {
        empresa_atual: `${rotuloEmpresa} — SharePoint instável, tentando de novo (tentativa ${n} de ${MAX_TENTATIVAS_EMPRESA})`,
      });
      return serializarSimulacao(atualizada);
    }
    resultado = {
      pronta: false,
      motivo: MOTIVO_ERRO,
      status: `Desisti depois de ${n} tentativas seguidas: ${mensagem}`,
      cnpj: null,
      qtdDocumentosElegiveis: proxima.qtd_documentos_elegiveis,
      documentosElegiveis: [],
      qtdDocumentosEscaneados: proxima.qtd_documentos_escaneados,
      documentosEscaneados: proxima.documentos_escaneados,
      qtdDocumentosIgnorados: proxima.qtd_documentos_ignorados,
      documentosIgnorados: proxima.documentos_ignorados,
      documentoCnpjOrigem: null,
      buscaIncompleta: false,
    };
  }

  // A busca do CNPJ estourou o orçamento de tempo mas o que já foi lido ficou
  // guardado: a empresa NÃO é dada como processada. O próximo passo pega a mesma
  // empresa de novo (é a primeira ainda não processada) e continua do documento
  // seguinte, com orçamento novo. O resultado parcial fica visível no motivo/status.
  if (resultado.buscaIncompleta) {
    await dbz.atualizarEmpresaSimulacao(proxima.id, {
      processada: false,
      pronta: false,
      motivo: resultado.motivo,
      status: resultado.status,
      qtd_documentos_elegiveis: resultado.qtdDocumentosElegiveis,
      documentos_elegiveis: resultado.documentosElegiveis,
      qtd_documentos_escaneados: resultado.qtdDocumentosEscaneados,
      documentos_escaneados: resultado.documentosEscaneados,
      qtd_documentos_ignorados: resultado.qtdDocumentosIgnorados,
      documentos_ignorados: resultado.documentosIgnorados,
    });
    const atualizada = await dbz.atualizarSimulacao(simulacao.id, {
      empresa_atual: `${rotuloEmpresa} — continuando a busca do CNPJ de onde parou`,
    });
    return serializarSimulacao(atualizada);
  }

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

  // Contagem nas linhas, não "valor lido no começo do passo + 1": o passo pode
  // levar dezenas de segundos e outro passo pode ter gravado nesse meio tempo.
  const { processadas: empresasProcessadas, prontas: empresasProntas } = await dbz.contarProgressoSimulacao(simulacao.id);
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
