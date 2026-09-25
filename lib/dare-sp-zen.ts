// Envio da guia DARE-SP para o Edoc do Questor Zen (SERVIDOR).
//
// Mesmo caminho do Robô Zen — upload do arquivo, depois importação do
// documento —, mas em outra categoria e com o bloco `Atributo` preenchido.
// O robô sempre mandou vencimento, competência e valor vazios porque contrato
// social não tem nenhum dos três; uma guia tem os três, e é o que faz o
// documento aparecer no Edoc com data e valor em vez de virar um PDF solto.

import {
  buscarCodigoCategoria, consultarCliente, uploadArquivo, importarDocumento,
  hasQuestorZenToken, ClienteNaoEncontradoError, CategoriaNaoEncontradaError,
  CATEGORIA_PAI_TRIBUTARIO, CATEGORIA_FILHA_TRIBUTOS_ESTADUAIS,
} from "./questor-zen";
import { dataBR, valorBR, nomeDoArquivo } from "./dare-sp-zen-formato";

export { dataBR, valorBR, nomeDoArquivo };

export interface GuiaParaZen {
  cnpj: string;
  /** Competência do débito, "MM/AAAA". */
  referencia: string;
  /** Vencimento da guia, "AAAA-MM-DD". */
  vencimento: string;
  /** Total da guia: imposto + multa + juros. */
  total: number;
  /** PDF oficial devolvido pela Sefaz, em base64. */
  pdfBase64: string;
  /** Nome da empresa, só para compor o nome do arquivo. */
  nomeEmpresa?: string | null;
}

export interface ResultadoZen {
  documentoId: string;
  codigoCliente: string;
  codigoCategoria: string;
  nomeArquivo: string;
}

export function temTokenZen(): boolean {
  return hasQuestorZenToken();
}

/**
 * Sobe a guia para o Edoc, em Tributário › Tributos Estaduais.
 *
 * A ordem importa: cliente e categoria são resolvidos ANTES do upload. Subir
 * o arquivo primeiro e só então descobrir que a empresa não está no CRM
 * deixaria um PDF órfão no Zen a cada tentativa.
 */
export async function enviarGuiaAoZen(g: GuiaParaZen): Promise<ResultadoZen> {
  if (!hasQuestorZenToken()) {
    throw new Error("Token do Questor Zen não configurado (QUESTOR_ZEN_TOKEN).");
  }

  const bytes = Buffer.from(g.pdfBase64, "base64");
  if (bytes.length === 0) throw new Error("A guia veio sem PDF — nada a enviar.");

  let codigoCategoria: string;
  try {
    codigoCategoria = await buscarCodigoCategoria(
      CATEGORIA_PAI_TRIBUTARIO,
      CATEGORIA_FILHA_TRIBUTOS_ESTADUAIS
    );
  } catch (e) {
    if (e instanceof CategoriaNaoEncontradaError) {
      throw new Error(
        `Categoria "${CATEGORIA_PAI_TRIBUTARIO} › ${CATEGORIA_FILHA_TRIBUTOS_ESTADUAIS}" não existe no Zen. ` +
        "Crie-a em Edoc > Categorias ou confira o nome exato."
      );
    }
    throw e;
  }

  let codigoCliente: string;
  try {
    const cliente = await consultarCliente(g.cnpj);
    codigoCliente = cliente.CodigoCliente;
  } catch (e) {
    if (e instanceof ClienteNaoEncontradoError) {
      throw new Error(
        `A empresa ${g.nomeEmpresa ?? g.cnpj} não está cadastrada no Zen (CRM > Clientes). ` +
        "A guia foi emitida na Sefaz, mas não subiu para o Edoc."
      );
    }
    throw e;
  }

  const nomeArquivo = nomeDoArquivo(g.cnpj, g.referencia);
  const codigoArquivo = await uploadArquivo(nomeArquivo, bytes);

  const documentoId = await importarDocumento({
    codigoCategoria,
    codigoCliente,
    codigoArquivo,
    titulo: `DARE-SP ${g.referencia}`,
    observacao: "Guia gerada pelo Núcleo Contábil",
    dataVencimento: dataBR(g.vencimento),
    dataCompetencia: g.referencia,
    valor: valorBR(g.total),
  });

  return { documentoId, codigoCliente, codigoCategoria, nomeArquivo };
}
