// Envio da guia DARE-SP para o Edoc do Questor Zen (SERVIDOR).
//
// Mesmo caminho do Robô Zen — upload do arquivo, depois importação do
// documento —, mas em outra categoria e com o bloco `Atributo` preenchido.
// O robô sempre mandou vencimento, competência e valor vazios porque contrato
// social não tem nenhum dos três; uma guia tem os três, e é o que faz o
// documento aparecer no Edoc com data e valor em vez de virar um PDF solto.

import {
  buscarCodigoCategoria, consultarCliente, uploadArquivo, importarDocumento,
  hasQuestorZenToken, ClienteNaoEncontradoError, CategoriaNaoEncontradaError, QuestorZenError,
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
  /** true quando o Zen recusou vencimento/competência/valor e o documento foi sem eles. */
  semAtributos: boolean;
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

  const base = {
    codigoCategoria,
    codigoCliente,
    codigoArquivo,
    titulo: `DARE-SP ${g.referencia}`,
    observacao: "Guia gerada pelo Núcleo Contábil",
  };

  let documentoId: string;
  let semAtributos = false;
  try {
    documentoId = await importarDocumento({
      ...base,
      dataVencimento: dataBR(g.vencimento),
      dataCompetencia: g.referencia,
      valor: valorBR(g.total),
    });
  } catch (e) {
    // O Robô Zen, que funciona, sempre mandou vencimento, competência e valor
    // em branco — o DARE é o primeiro a preenchê-los. Se o Zen recusar o
    // formato de algum deles, publica sem os atributos em vez de perder o
    // envio: o arquivo já subiu, e documento sem valor no Edoc é melhor que
    // guia fora do Edoc. Timeout e falha de rede não entram aqui — repetir
    // no escuro poderia gravar o documento duas vezes.
    const recusa = e instanceof QuestorZenError && e.status >= 400 && e.status < 500;
    if (!recusa) throw e;
    console.error("[dare-sp/zen] Zen recusou os atributos; reenviando sem eles:", e.message);
    documentoId = await importarDocumento(base);
    semAtributos = true;
  }

  return { documentoId, codigoCliente, codigoCategoria, nomeArquivo, semAtributos };
}
