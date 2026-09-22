/**
 * Extração de dados da "Certidão de Inteiro Teor" (JUCESP) em PDF.
 *
 * Porta de `src/certidao_parser.py` do Robô Zen original (Python). Esses
 * PDFs costumam ser digitalizados/renderizados como imagem (não têm texto
 * selecionável), então o fluxo é:
 *
 *   1. Tenta extrair texto nativo do PDF (mupdf).
 *   2. Se vier pouco ou nenhum texto, cai para OCR (tesseract.js) página a
 *      página, em português — usando o `por.traineddata` empacotado junto
 *      (lib/robo-zen/tessdata), sem depender de nenhum CDN em runtime.
 *
 * Os campos abaixo foram mapeados a partir do modelo de certidão testado
 * (Memory Cream Serviços Para Eventos). Documentos de outras empresas podem
 * ter pequenas variações — os regexes usam nomes de campo como âncora e
 * tentam ser tolerantes a isso, mas vale revisar o resultado.
 */

import path from "node:path";
import { createWorker } from "tesseract.js";

export const MIN_CARACTERES_TEXTO_NATIVO = 40;

// Pasta com os modelos de idioma do Tesseract empacotados neste projeto
// (por.traineddata), copiada byte-a-byte do Robô Zen original. Evita
// qualquer download de CDN em runtime na Vercel.
const TESSDATA_DIR = path.join(process.cwd(), "lib", "robo-zen", "tessdata");

export interface DadosCertidao {
  nomeEmpresarial: string | null;
  tituloEstabelecimento: string | null;
  tipoJuridico: string | null;
  nire: string | null;
  cnpj: string | null;
  dataArquivamento: string | null;
  dataExpedicaoCertidao: string | null;
  codigoControle: string | null;
  textoBruto: string;
}

function dadosCertidaoVazio(textoBruto: string): DadosCertidao {
  return {
    nomeEmpresarial: null,
    tituloEstabelecimento: null,
    tipoJuridico: null,
    nire: null,
    cnpj: null,
    dataArquivamento: null,
    dataExpedicaoCertidao: null,
    codigoControle: null,
    textoBruto,
  };
}

// mupdf é ESM com top-level await — precisa de import() dinâmico dentro de
// código que pode rodar em CommonJS (Next.js/Vercel functions).
async function carregarMupdf() {
  return await import("mupdf");
}

/** Extrai o texto nativo/selecionável de todas as páginas do PDF (sem OCR). */
export async function extrairTextoNativo(bytes: Uint8Array | Buffer): Promise<string> {
  const mupdf = await carregarMupdf();
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    const partes: string[] = [];
    const totalPaginas = doc.countPages();
    for (let i = 0; i < totalPaginas; i++) {
      const page = doc.loadPage(i);
      try {
        partes.push(page.toStructuredText("").asText() ?? "");
      } finally {
        page.destroy();
      }
    }
    return partes.join("\n").trim();
  } finally {
    doc.destroy();
  }
}

/**
 * Extrai texto via OCR (tesseract.js), rasterizando a 300 DPI — só as
 * primeiras `paginas` páginas, igual ao `_extrair_texto_ocr(paginas=2)` do
 * Python, já que o CNPJ costuma aparecer bem no início do documento.
 */
export async function extrairTextoOcr(
  bytes: Uint8Array | Buffer,
  paginas = 2
): Promise<string> {
  const mupdf = await carregarMupdf();
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const worker = await createWorker("por", 1, {
    langPath: TESSDATA_DIR,
    cacheMethod: "none",
    gzip: false,
  });

  try {
    const partes: string[] = [];
    const totalPaginas = Math.min(doc.countPages(), paginas);
    const dpi = 300;
    const matrix = mupdf.Matrix.scale(dpi / 72, dpi / 72);

    for (let i = 0; i < totalPaginas; i++) {
      const page = doc.loadPage(i);
      try {
        const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
        try {
          const png = pixmap.asPNG();
          const { data } = await worker.recognize(Buffer.from(png));
          partes.push(data.text ?? "");
        } finally {
          pixmap.destroy();
        }
      } finally {
        page.destroy();
      }
    }

    return partes.join("\n").trim();
  } finally {
    await worker.terminate();
    doc.destroy();
  }
}

/**
 * Extrai o texto do PDF: tenta nativo primeiro, cai para OCR se vier curto
 * demais (< MIN_CARACTERES_TEXTO_NATIVO) — mesmo critério do Python.
 */
export async function extrairTexto(bytes: Uint8Array | Buffer): Promise<string> {
  const texto = await extrairTextoNativo(bytes);
  if (texto.length >= MIN_CARACTERES_TEXTO_NATIVO) {
    return texto;
  }
  return extrairTextoOcr(bytes);
}

/**
 * Checagem RÁPIDA (sem rodar OCR) de se um PDF provavelmente é uma imagem
 * digitalizada em vez de texto nativo/selecionável — mesmo critério usado
 * em extrairTexto() (MIN_CARACTERES_TEXTO_NATIVO), mas sem pagar o custo do
 * OCR quando só queremos saber "é legível ou não".
 *
 * Usado para avisar quando um documento que vai ser ENVIADO ao Questor (não
 * só o usado pra extrair CNPJ) é uma imagem sem texto — muitos contratos
 * assinados/escaneados na pasta de Contratos são assim, não só a Certidão
 * de Inteiro Teor.
 */
export async function pdfPareceEscaneado(bytes: Uint8Array | Buffer): Promise<boolean> {
  try {
    const texto = await extrairTextoNativo(bytes);
    return texto.length < MIN_CARACTERES_TEXTO_NATIVO;
  } catch {
    return true;
  }
}

function buscar(padrao: RegExp, texto: string): string | null {
  const m = texto.match(padrao);
  return m ? m[1].trim() : null;
}

/**
 * Encontra a linha de cabeçalho de uma "tabela" da certidão e devolve os
 * tokens da primeira linha não vazia seguinte (as colunas de valores).
 *
 * A certidão da JUCESP imprime os rótulos das colunas em uma linha e os
 * valores logo abaixo (ex.: "NIRE CNPJ NÚMERO DO ARQUIVAMENTO DATA DO
 * ARQUIVAMENTO" seguido de "35280645715 68.422.703/0001-41 ... 06/08/2026").
 * Isso é frágil a variações de layout — usado só para os campos tabulares
 * conhecidos deste modelo.
 */
function extrairLinhaValoresAposCabecalho(
  texto: string,
  cabecalhoRegex: RegExp
): string[] | null {
  const linhas = texto.split(/\r?\n/);
  for (let i = 0; i < linhas.length; i++) {
    if (cabecalhoRegex.test(linhas[i])) {
      for (let j = i + 1; j < linhas.length; j++) {
        const candidata = linhas[j].trim();
        if (candidata) {
          return candidata.split(/\s+/);
        }
      }
      break;
    }
  }
  return null;
}

export function parseCertidao(texto: string): DadosCertidao {
  const dados = dadosCertidaoVazio(texto);

  dados.nomeEmpresarial = buscar(/NOME EMPRESARIAL\s*\n?\s*(.+)/i, texto);
  dados.tituloEstabelecimento = buscar(
    /TITULO DE ESTABELECIMENTO\s*(?:TIPO JUR[IÍ]DICO)?\s*\n?\s*(.+)/i,
    texto
  );
  if (texto.toUpperCase().includes("SOCIEDADE LIMITADA")) {
    dados.tipoJuridico = "SOCIEDADE LIMITADA";
  }

  // Tabela: NIRE | CNPJ | NÚMERO DO ARQUIVAMENTO | DATA DO ARQUIVAMENTO
  let valores = extrairLinhaValoresAposCabecalho(
    texto,
    /NIRE\s+CNPJ\s+N[ÚU]MERO DO ARQUIVAMENTO\s+DATA DO ARQUIVAMENTO/i
  );
  if (valores && valores.length >= 4) {
    dados.nire = valores[0];
    dados.cnpj = valores[1];
    dados.dataArquivamento = valores[3];
  }

  // Tabela: DATA DE EXPEDIÇÃO | HORA DE EXPEDIÇÃO | CÓDIGO DE CONTROLE
  valores = extrairLinhaValoresAposCabecalho(
    texto,
    /DATA DE EXPEDI[ÇC][ÃA]O\s+HORA DE EXPEDI[ÇC][ÃA]O\s+C[ÓO]DIGO DE CONTROLE/i
  );
  if (valores && valores.length >= 3) {
    dados.dataExpedicaoCertidao = valores[0];
    dados.codigoControle = valores[2];
  }

  // Fallbacks (caso o layout de tabela não bata): regex direto no texto.
  if (!dados.nire) {
    dados.nire = buscar(/\bNIRE\b\D*(\d{8,})/i, texto);
  }
  if (!dados.cnpj) {
    dados.cnpj = buscar(/(\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2})/, texto);
  }
  if (!dados.cnpj) {
    dados.cnpj = buscarCnpjProximoAoRotulo(texto);
  }

  // Validação final: confere o dígito verificador oficial do CNPJ. Isso
  // pegou casos reais em que o CNPJ extraído pelas regras acima vinha
  // ERRADO — não por falta de CNPJ no documento, mas porque a extração de
  // texto do PDF (fonte com metadados ruins, ou OCR de página escaneada)
  // embaralhou um dígito numa das ocorrências. Como a Certidão/Contrato
  // costuma repetir o CNPJ várias vezes (cabeçalho, rodapé, corpo do
  // texto), a correção é varrer TODAS as ocorrências parecidas com CNPJ no
  // documento e, se a que foi escolhida acima não bater no dígito
  // verificador oficial, trocar por outra ocorrência que bata (de
  // preferência a mais repetida). Sem isso, o robô mandava um CNPJ
  // inválido pro Questor e a API recusava com "Inscrição Federal Inválida".
  dados.cnpj = melhorCnpjDoTexto(texto, dados.cnpj);

  return dados;
}

/**
 * Confere os dois dígitos verificadores oficiais do CNPJ (módulo 11).
 *
 * Aceita com ou sem pontuação. Só devolve true se as contas baterem — não
 * é uma verificação de existência real na Receita, só da fórmula.
 */
export function cnpjValido(cnpj: string): boolean {
  const digitos = cnpj.replace(/\D/g, "");
  if (digitos.length !== 14 || digitos === digitos[0].repeat(14)) {
    return false;
  }

  const digitoVerificador = (base: string, pesos: number[]): string => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * pesos[i];
    }
    const resto = soma % 11;
    return resto < 2 ? "0" : String(11 - resto);
  };

  const dv1 = digitoVerificador(digitos.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = digitoVerificador(
    digitos.slice(0, 12) + dv1,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  );
  return digitos.slice(-2) === dv1 + dv2;
}

const REGEX_CNPJ_GENERICO = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g;

/**
 * Se `candidatoAtual` já é um CNPJ válido (dígito verificador OK), devolve
 * ele mesmo sem mexer. Senão, varre TODAS as ocorrências de algo parecido
 * com CNPJ no texto inteiro e devolve a primeira que passar na validação —
 * priorizando a que aparecer mais vezes no documento, já que o CNPJ de
 * verdade normalmente se repete (e uma ocorrência corrompida pela extração
 * costuma ser única). Se nenhuma ocorrência validar, devolve
 * `candidatoAtual` sem alterar (mantém o comportamento antigo quando não há
 * nada melhor pra usar).
 */
export function melhorCnpjDoTexto(texto: string, candidatoAtual: string | null): string | null {
  if (candidatoAtual && cnpjValido(candidatoAtual)) {
    return candidatoAtual;
  }

  const contagem = new Map<string, number>();
  const ordem: string[] = [];

  for (const m of texto.matchAll(REGEX_CNPJ_GENERICO)) {
    const digitos = m[0].replace(/\D/g, "");
    if (digitos.length !== 14) continue;
    const formatado = `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12, 14)}`;
    contagem.set(formatado, (contagem.get(formatado) ?? 0) + 1);
    if (!ordem.includes(formatado)) {
      ordem.push(formatado);
    }
  }

  const validos = ordem.filter((c) => cnpjValido(c));
  if (validos.length > 0) {
    validos.sort((a, b) => (contagem.get(b) ?? 0) - (contagem.get(a) ?? 0));
    return validos[0];
  }

  return candidatoAtual;
}

/**
 * Último recurso: procura 14 dígitos (CNPJ) logo depois de alguma
 * ocorrência da palavra "CNPJ" no texto, mesmo sem nenhuma pontuação (sem
 * pontos, barra ou traço) — layout visto em pelo menos um modelo de
 * "Recibo"/página de "DADOS CADASTRAIS" da JUCESP (ex.: campo "CNPJ - SEDE"
 * com o valor "63554555000103" corrido, sem "/" nem ".").
 *
 * Só olha numa janela pequena (até ~50 caracteres) depois de cada "CNPJ"
 * encontrado, pra não arriscar casar um número qualquer de 14 dígitos que
 * esteja em outro lugar do documento sem relação nenhuma com o CNPJ.
 * Devolve já formatado como XX.XXX.XXX/XXXX-XX.
 */
function buscarCnpjProximoAoRotulo(texto: string): string | null {
  for (const m of texto.matchAll(/CNPJ/gi)) {
    const inicio = (m.index ?? 0) + m[0].length;
    const janela = texto.slice(inicio, inicio + 50);
    const m2 = janela.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
    if (!m2) continue;
    const digitos = m2[1].replace(/\D/g, "");
    if (digitos.length === 14) {
      return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12, 14)}`;
    }
  }
  return null;
}

/** Extrai texto do PDF (nativo com fallback OCR) e faz o parse da certidão. */
export async function extrairDadosCertidao(bytes: Uint8Array | Buffer): Promise<DadosCertidao> {
  const texto = await extrairTexto(bytes);
  return parseCertidao(texto);
}
