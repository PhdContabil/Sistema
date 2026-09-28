// Envio da guia DARE-SP para o Edoc do Questor Zen (SERVIDOR).
//
// Mesmo caminho do Robô Zen — upload do arquivo, depois importação do
// documento —, mas em outra categoria e com o bloco `Atributo` preenchido.
// O robô sempre mandou vencimento, competência e valor vazios porque contrato
// social não tem nenhum dos três; uma guia tem os três, e é o que faz o
// documento aparecer no Edoc com data e valor em vez de virar um PDF solto.

import {
  consultarCategorias, consultarCliente, uploadArquivo, importarDocumento,
  hasQuestorZenToken, ClienteNaoEncontradoError, QuestorZenError,
  CATEGORIA_PAI_TRIBUTARIO, CATEGORIA_FILHA_TRIBUTOS_ESTADUAIS,
} from "./questor-zen";
import { dataBR, valorBR, nomeDoArquivo, tituloDoZen, acharCategoria, listarCategorias, type NoCategoria } from "./dare-sp-zen-formato";

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
  /** Código do imposto da view (46-2, 146-3...): decide o título no Edoc. */
  codigoImposto: string;
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

  const codigoCategoria = await categoriaDoDare();

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
    titulo: tituloDoZen(g.codigoImposto, g.referencia),
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

/**
 * Código da categoria Tributário › Tributos Estaduais no Edoc.
 *
 * A busca exata do Robô Zen ("Societário" > "Contratos") falhou aqui: o nome
 * no Zen não bate letra por letra com o que a equipe usa no dia a dia. A busca
 * agora ignora acento, maiúscula e espaço sobrando, e procura a filha em
 * qualquer nível da árvore. Se mesmo assim não achar, o erro lista as
 * categorias que existem — para acertar o nome sem precisar abrir o Zen.
 *
 * `QUESTOR_ZEN_CATEGORIA_DARE`, se definida, é usada direto (código da
 * categoria), sem consultar a árvore.
 */
/**
 * Código de Tributário › Tributos Estaduais no Edoc, passado pela equipe.
 *
 * Vai fixo porque a busca pelo nome não achou a categoria na árvore do Zen.
 * A variável de ambiente, se existir, tem precedência; a busca por nome fica
 * só como reserva, caso este código seja esvaziado.
 */
const CODIGO_CATEGORIA_DARE = "5a293cc14b541610084cad83";

async function categoriaDoDare(): Promise<string> {
  const fixa = process.env.QUESTOR_ZEN_CATEGORIA_DARE?.trim() || CODIGO_CATEGORIA_DARE;
  if (fixa) return fixa;

  const arvore = (await consultarCategorias()) as unknown as NoCategoria[];
  const codigo = acharCategoria(arvore, CATEGORIA_PAI_TRIBUTARIO, CATEGORIA_FILHA_TRIBUTOS_ESTADUAIS);
  if (codigo) return codigo;

  throw new Error(
    `Categoria "${CATEGORIA_PAI_TRIBUTARIO} › ${CATEGORIA_FILHA_TRIBUTOS_ESTADUAIS}" não encontrada no Zen. ` +
    `Categorias que existem: ${listarCategorias(arvore).join("; ") || "(nenhuma)"}`
  );
}
