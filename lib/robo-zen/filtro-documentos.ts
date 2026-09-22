/**
 * Filtro de quais documentos dentro de "Contratos" (ou equivalente) devem
 * ser enviados ao Questor Zen. Porta de `src/filtro_documentos.py` do Robô
 * Zen original (Python).
 *
 * Regra combinada com a Júlia: envia todos os documentos da pasta, EXCETO
 * os que parecerem ser contrato de locação/aluguel, contrato de prestação
 * de serviços, ou instrumento de compra e venda (mesmo quando não é de
 * imóvel — Júlia confirmou que compra e venda deve SEMPRE ficar de fora,
 * independente do que mais disser no nome do arquivo) — esses ficam fora
 * do "nicho" de legalização/societário (constituição, alteração
 * contratual, transformação, cancelamento/distrato, certidões etc.) que o
 * robô deve cadastrar no Edoc.
 */

// Termos (já sem acento, minúsculos) que, se aparecerem no nome do
// arquivo, fazem o documento ser IGNORADO — fora do escopo pedido.
// "aluguel" incluído como sinônimo comum de "locação".
const TERMOS_EXCLUIDOS = [
  "locacao",
  "aluguel",
  "prestacao de servico", // cobre singular e plural ("...servicos")
  "compra e venda", // sempre exclui, mesmo que não seja de imóvel (ex.: de cotas)
];

// Termos que ajudam a identificar QUAL documento usar para extrair os
// dados da empresa (CNPJ etc.) — hoje só a Certidão de Inteiro Teor tem um
// layout que o robô sabe ler via OCR (ver lib/robo-zen/certidao-parser.ts).
const TERMOS_CERTIDAO = ["certidao de inteiro teor", "certidao"];

/** minúsculas e sem acento, para comparar nomes de arquivo sem depender de
 * como cada um foi digitado (com/sem acento, maiúsculas). */
function normalizar(texto: string): string {
  return texto
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Nome do arquivo sem a extensão (equivalente a `Path.stem` do Python). */
function semExtensao(nomeArquivo: string): string {
  const i = nomeArquivo.lastIndexOf(".");
  return i > 0 ? nomeArquivo.slice(0, i) : nomeArquivo;
}

/**
 * False se o nome do arquivo indicar contrato de locação/aluguel, de
 * prestação de serviços, ou de compra e venda — esses não devem ser
 * enviados ao Questor.
 */
export function deveEnviarDocumento(nomeArquivo: string): boolean {
  const nomeNormalizado = normalizar(nomeArquivo);
  return !TERMOS_EXCLUIDOS.some((termo) => nomeNormalizado.includes(termo));
}

/** Um item com pelo menos um nome de arquivo — tipicamente um item do
 * Graph/SharePoint (`{ itemId, nome, ... }`), mas qualquer objeto serve. */
export interface ComNomeDeArquivo {
  nome: string;
}

/** Separa `arquivos` em (elegíveis para envio, ignorados). */
export function filtrarDocumentosParaEnviar<T extends ComNomeDeArquivo>(
  arquivos: T[]
): { elegiveis: T[]; ignorados: T[] } {
  const elegiveis: T[] = [];
  const ignorados: T[] = [];
  for (const arquivo of arquivos) {
    (deveEnviarDocumento(arquivo.nome) ? elegiveis : ignorados).push(arquivo);
  }
  return { elegiveis, ignorados };
}

/**
 * Devolve `arquivos` reordenados por prioridade para extrair CNPJ/dados da
 * empresa: primeiro o(s) que parecer(em) Certidão de Inteiro Teor pelo
 * nome, depois o resto, cada grupo mantendo a ordem original.
 *
 * Por que uma LISTA de candidatos, e não só "o melhor"? Já vimos, na
 * prática (caso Ecoplating), que:
 *   - o nome do arquivo pode enganar — a certidão de verdade estava salva
 *     como "Arquivamento de ata - aprovação de lucros.pdf", sem a palavra
 *     "certidão" no nome; e
 *   - o primeiro arquivo da pasta pode não estar de fato legível (ex.:
 *     arquivo do OneDrive ainda não baixado, aparece com 0 páginas — no
 *     SharePoint via Graph isso já não se aplica do mesmo jeito, mas o
 *     princípio de não confiar cegamente no primeiro arquivo continua
 *     valendo: o OCR pode simplesmente falhar em extrair um CNPJ válido).
 *
 * Por isso quem chama isto deve tentar os candidatos NESSA ORDEM e seguir
 * para o próximo se um falhar ou não render um CNPJ, em vez de confiar
 * cegamente no primeiro.
 */
export function ordenarCandidatosParaExtrairDados<T extends ComNomeDeArquivo>(arquivos: T[]): T[] {
  const comNomeCertidao: T[] = [];
  const resto: T[] = [];
  for (const arquivo of arquivos) {
    const nomeNormalizado = normalizar(semExtensao(arquivo.nome));
    if (TERMOS_CERTIDAO.some((termo) => nomeNormalizado.includes(termo))) {
      comNomeCertidao.push(arquivo);
    } else {
      resto.push(arquivo);
    }
  }
  return [...comNomeCertidao, ...resto];
}

/**
 * Escolhe, dentre `arquivos`, qual usar para extrair CNPJ/dados da
 * empresa — prioriza um arquivo que pareça ser a Certidão de Inteiro Teor
 * (o único layout que o robô sabe ler via OCR); se não achar nenhum, cai
 * para o primeiro da lista (pode falhar na extração se não for um
 * documento desse tipo — nesse caso o robô avisa o erro).
 *
 * Mantida por compatibilidade — prefira `ordenarCandidatosParaExtrairDados`
 * quando for possível tentar mais de um candidato (ver motivo lá).
 */
export function escolherDocumentoParaExtrairDados<T extends ComNomeDeArquivo>(
  arquivos: T[]
): T | null {
  const candidatos = ordenarCandidatosParaExtrairDados(arquivos);
  return candidatos[0] ?? null;
}
