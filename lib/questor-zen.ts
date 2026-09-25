// Cliente server-side da API do Questor Zen (módulo Edoc) — porta de
// `src/questor_client.py` do Robô Zen original (Python).
//
// Diferente de `lib/questor.ts` (API de consulta, somente-leitura, header
// X-API-Key): esta é uma API DIFERENTE — o Edoc do Questor Zen, documentada
// em https://documenter.getpostman.com/view/19136635/UyxhonL3 (coleção
// "ZEN", pasta "Edoc") — cujo token de acesso entra no PATH da URL, não em
// um header, e que GRAVA documentos de verdade (upload + cadastro).
//
// NUNCA importe isto em um componente client: o token é a "Chave Acesso" do
// Questor Zen (Minha Conta > Chave Acesso) e só pode existir no servidor.
//
// Fluxo documentado para cadastrar um documento por completo:
//   1. Upload do arquivo (POST /upload/<nome>) -> guarda o CodigoArquivo.
//   2. Busca o CodigoCategoria em /categorias (Societário > Contratos).
//   3. Busca o CodigoCliente em /clientes/<CNPJ>.
//   4. Envia tudo para POST /documentos.
//
// Nota sobre a confirmação antes de enviar: no Python original,
// `cadastrar_contratos(confirmar_antes_de_enviar=True)` pausava num
// `input()` no terminal. Numa função serverless não existe terminal, então
// essa confirmação foi para fora deste módulo — vira o fluxo de
// "preparar -> confirmar" com token de uso único (tabela
// `robo_zen_envios_pendentes`) implementado nas rotas de API
// (app/api/paralegal/robo-zen/**). Este arquivo só executa o cadastro em
// si, sem pausar por confirmação.

const QUESTOR_ZEN_DOMINIO = process.env.QUESTOR_ZEN_DOMINIO?.trim() || "phd.app.questorpublico.com.br";

// Valores fixos combinados com a Júlia para este fluxo (confirmados direto
// na árvore real de categorias da conta dela via GET /categorias — o
// exemplo da documentação do Postman usa "Contrato Social", que é só o
// nome da conta de demonstração deles, não existe na conta da Júlia).
export const CATEGORIA_PAI = "Societário";
export const CATEGORIA_FILHA = "Contratos";
export const ASSUNTO_FIXO = "Contrato Social";
// ATENÇÃO: no Python original esse valor era "teste" — literalmente o
// texto do campo "Observação" de cada documento cadastrado no Questor Zen,
// inclusive nos envios reais. Mantido aqui para portar com fidelidade, mas
// vale confirmar com a Júlia se isso deveria virar algo mais descritivo
// (ex.: "Cadastrado via Robô Zen") antes de ligar os envios reais em produção.
export const OBSERVACAO_FIXA = "teste";

/** Categoria das guias fiscais estaduais no Edoc (DARE-SP). */
export const CATEGORIA_PAI_TRIBUTARIO = "Tributário";
export const CATEGORIA_FILHA_TRIBUTOS_ESTADUAIS = "Tributos Estaduais";

const TIMEOUT_PADRAO_MS = 30_000;
// POST /documentos parece demorar mais que os outros endpoints em alguns
// casos (o servidor faz uma checagem de permissão do cliente antes de
// gravar) — já vimos esse passo estourar um timeout de 30s no Python. Por
// isso ele tem um timeout próprio, mais generoso.
const TIMEOUT_DOCUMENTOS_MS = 90_000;

// Alguns provedores bloqueiam no nível do proxy/WAF requisições cujo
// User-Agent identifica bibliotecas HTTP conhecidas, mesmo com token
// válido — o pedido nem chega no backend da aplicação (por isso o erro
// vem do nginx puro, como "403 Forbidden" com corpo HTML, não um JSON de
// erro do Questor). Usamos um User-Agent "neutro" (mesmo estilo do curl
// usado nos exemplos da documentação) para evitar esse tipo de bloqueio.
const HEADERS_PADRAO: HeadersInit = {
  "User-Agent": "curl/8.0.1",
  Accept: "application/json",
};

export class QuestorZenError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "QuestorZenError";
    this.status = status;
  }
}

/** A empresa (pelo CNPJ) não está cadastrada como cliente no Questor. */
export class ClienteNaoEncontradoError extends QuestorZenError {
  constructor(message: string) {
    super(message, 404);
    this.name = "ClienteNaoEncontradoError";
  }
}

/** Categoria/subcategoria não encontrada em /categorias. */
export class CategoriaNaoEncontradaError extends QuestorZenError {
  constructor(message: string) {
    super(message, 404);
    this.name = "CategoriaNaoEncontradaError";
  }
}

/** Token de acesso à API do Questor Zen não configurado no servidor. */
export class CredenciaisNaoConfiguradasError extends QuestorZenError {
  constructor() {
    super(
      "Token de acesso à API do Questor Zen não configurado. Defina a " +
        "variável de ambiente QUESTOR_ZEN_TOKEN com a 'Chave Acesso' " +
        "disponível dentro do Questor Zen em: Minha Conta > Chave Acesso.",
      500
    );
    this.name = "CredenciaisNaoConfiguradasError";
  }
}

function somenteDigitos(texto: string): string {
  return (texto || "").replace(/\D/g, "");
}

/**
 * Base da API REST do Questor Zen. O token de acesso entra no path, como
 * documentado em: https://documenter.getpostman.com/view/19136635/UyxhonL3
 * (coleção "ZEN", pasta "Edoc").
 */
function montarUrlBaseApi(): string {
  const token = process.env.QUESTOR_ZEN_TOKEN?.trim();
  if (!token) {
    throw new CredenciaisNaoConfiguradasError();
  }
  return `https://${QUESTOR_ZEN_DOMINIO}/api/v1/${token}`;
}

export function hasQuestorZenToken(): boolean {
  return Boolean(process.env.QUESTOR_ZEN_TOKEN?.trim());
}

/**
 * Executa uma chamada HTTP tratando erros de rede/timeout, convertendo-os
 * numa mensagem legível em português — mantendo o "contexto" (qual chamada
 * falhou) para facilitar o diagnóstico.
 */
async function requisitar(
  metodo: "GET" | "POST",
  url: string,
  contexto: string,
  timeoutMs: number,
  init: RequestInit = {}
): Promise<Response> {
  try {
    return await fetch(url, {
      method: metodo,
      headers: { ...HEADERS_PADRAO, ...(init.headers ?? {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      ...init,
    });
  } catch (exc) {
    if (exc instanceof DOMException && exc.name === "TimeoutError") {
      throw new QuestorZenError(
        `${contexto}: o Questor Zen demorou mais de ${Math.round(timeoutMs / 1000)}s para ` +
          "responder e a conexão foi encerrada.\nIsso costuma acontecer " +
          "quando o servidor está sobrecarregado ou fazendo uma validação " +
          "mais lenta (por exemplo, checagem de permissão do cliente). " +
          "Tente novamente em alguns instantes; se continuar acontecendo, " +
          "avise o suporte do Questor Zen.",
        504
      );
    }
    throw new QuestorZenError(
      `${contexto}: não foi possível conectar ao Questor Zen (${QUESTOR_ZEN_DOMINIO}). ` +
        "Confira a conexão e se o domínio configurado em QUESTOR_ZEN_DOMINIO está correto.",
      502
    );
  }
}

async function checarResposta(resposta: Response, contexto: string): Promise<unknown> {
  if (!resposta.ok) {
    // IMPORTANTE: a API do Questor Zen às vezes devolve o motivo real do
    // erro num header chamado "MsgErro", enquanto o corpo da resposta é só
    // uma página HTML genérica de erro (ex.: 404 padrão do IIS/nginx, sem
    // relação nenhuma com o motivo verdadeiro). Descoberto testando ao
    // vivo no Python original: um POST /documentos com dados válidos, mas
    // sem permissão, voltou "404 Arquivo não encontrado" no corpo — e o
    // header MsgErro explicava o motivo de verdade. Por isso sempre
    // olhamos esse header primeiro.
    const msgErroHeader = resposta.headers.get("MsgErro");
    const contentType = resposta.headers.get("Content-Type") ?? "";
    const ehErroBruto = contentType.startsWith("text/html") && !msgErroHeader;

    let dica = "";
    if ((resposta.status === 403 || resposta.status === 404) && ehErroBruto) {
      dica =
        "\nEsse erro veio como página HTML genérica (não um JSON da " +
        "aplicação Questor Zen) — pode ser domínio (QUESTOR_ZEN_DOMINIO) " +
        "incorreto, IP não liberado, ou a API precisar ser " +
        "habilitada/autorizada no Questor Zen antes de usar (fale com o " +
        "suporte do Questor se persistir).";
    } else if (resposta.status === 401 || resposta.status === 403) {
      dica =
        "\nConfira se o QUESTOR_ZEN_TOKEN é a Chave Acesso correta (Minha Conta > Chave Acesso).";
    }

    const corpoTexto = await resposta.text().catch(() => "");
    const corpoRelevante = msgErroHeader || corpoTexto.slice(0, 500);
    throw new QuestorZenError(
      `${contexto} falhou (HTTP ${resposta.status}): ${corpoRelevante}${dica}`,
      resposta.status
    );
  }

  const corpoTexto = await resposta.text();
  if (!corpoTexto) return null;
  try {
    return JSON.parse(corpoTexto);
  } catch {
    return corpoTexto;
  }
}

/** Remove aspas externas de uma resposta que veio como string JSON simples (ex.: `"ABC123"`). */
function semAspas(valor: string): string {
  return valor.replace(/^"|"$/g, "");
}

export interface CategoriaFilha {
  Codigo: string;
  Descricao: string;
}
export interface CategoriaPai {
  Codigo: string;
  Descricao: string;
  Categorias?: CategoriaFilha[];
}

/** GET /categorias — árvore completa de categorias do Edoc. */
export async function consultarCategorias(): Promise<CategoriaPai[]> {
  const url = `${montarUrlBaseApi()}/categorias`;
  const resposta = await requisitar("GET", url, "Consultar Categorias", TIMEOUT_PADRAO_MS);
  return (await checarResposta(resposta, "Consultar Categorias")) as CategoriaPai[];
}

/**
 * Encontra o Codigo da subcategoria (ex.: Societário > Contratos).
 *
 * Busca dinamicamente em vez de fixar o ID no código: os IDs das
 * categorias do Questor Zen podem variar entre contas/instalações.
 */
export async function buscarCodigoCategoria(
  categoriaPai: string = CATEGORIA_PAI,
  categoriaFilha: string = CATEGORIA_FILHA
): Promise<string> {
  const categorias = await consultarCategorias();
  for (const pai of categorias) {
    if ((pai.Descricao ?? "").trim().toLowerCase() !== categoriaPai.trim().toLowerCase()) {
      continue;
    }
    for (const filha of pai.Categorias ?? []) {
      if ((filha.Descricao ?? "").trim().toLowerCase() === categoriaFilha.trim().toLowerCase()) {
        return filha.Codigo;
      }
    }
  }
  throw new CategoriaNaoEncontradaError(
    `Categoria '${categoriaPai} > ${categoriaFilha}' não encontrada em /categorias. ` +
      "Confira os nomes exatos com consultarCategorias()."
  );
}

export interface ClienteQuestor {
  CodigoCliente: string;
  Nome?: string;
  [chave: string]: unknown;
}

/**
 * GET /clientes/<cnpj> — dados do cliente cadastrado no Questor.
 *
 * `cnpj` pode vir formatado (com pontos/barra/traço); só os dígitos são
 * usados, como no exemplo da documentação (InscricaoFederal sem máscara).
 */
export async function consultarCliente(cnpj: string): Promise<ClienteQuestor> {
  const cnpjLimpo = somenteDigitos(cnpj);
  const url = `${montarUrlBaseApi()}/clientes/${cnpjLimpo}`;
  const resposta = await requisitar("GET", url, "Consultar Cliente", TIMEOUT_PADRAO_MS);
  if (resposta.status === 404) {
    throw new ClienteNaoEncontradoError(
      `Nenhum cliente encontrado no Questor Zen para o CNPJ ${cnpjLimpo}. ` +
        "Verifique se a empresa está cadastrada em CRM > Clientes."
    );
  }
  return (await checarResposta(resposta, "Consultar Cliente")) as ClienteQuestor;
}

/**
 * POST /upload/<nome> — envia o arquivo e devolve o CodigoArquivo.
 *
 * `bytes` vem tipicamente de um download do SharePoint via Graph (não de
 * um caminho de arquivo local — não existe filesystem persistente na
 * Vercel).
 */
export async function uploadArquivo(nomeArquivo: string, bytes: Uint8Array | Buffer): Promise<string> {
  const url = `${montarUrlBaseApi()}/upload/${encodeURIComponent(nomeArquivo)}`;
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  formData.append("file", blob, nomeArquivo);

  const resposta = await requisitar("POST", url, "Upload Arquivos", TIMEOUT_PADRAO_MS, {
    body: formData,
  });
  const codigoArquivo = await checarResposta(resposta, "Upload Arquivos");
  if (typeof codigoArquivo !== "string") {
    throw new QuestorZenError(
      `Resposta inesperada do upload (esperava uma string com o CodigoArquivo): ${JSON.stringify(codigoArquivo)}`
    );
  }
  return semAspas(codigoArquivo);
}

function formatarDataPublicacao(data: Date = new Date()): string {
  const dd = String(data.getDate()).padStart(2, "0");
  const mm = String(data.getMonth() + 1).padStart(2, "0");
  const yyyy = data.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export interface ImportarDocumentoParams {
  codigoCategoria: string;
  codigoCliente: string;
  codigoArquivo: string;
  titulo?: string;
  observacao?: string;
  dataPublicacao?: string;
  /**
   * Campos do bloco `Atributo`, que o Zen já tinha e o robô sempre mandou
   * vazios. Uma guia fiscal precisa deles preenchidos — é o que faz o
   * documento aparecer com vencimento e valor no Edoc, em vez de só um PDF
   * solto. Sem os parâmetros, seguem "" como antes.
   */
  dataVencimento?: string;
  dataCompetencia?: string;
  valor?: string;
}

/**
 * POST /documentos — registra o documento no Edoc do Questor Zen.
 * Retorna o ID do documento criado.
 */
export async function importarDocumento(params: ImportarDocumentoParams): Promise<string> {
  const url = `${montarUrlBaseApi()}/documentos`;
  const corpo = {
    CodigoCategoria: params.codigoCategoria,
    CodigoCliente: params.codigoCliente,
    CodigoArquivo: params.codigoArquivo,
    Titulo: params.titulo ?? ASSUNTO_FIXO,
    Observacao: params.observacao ?? OBSERVACAO_FIXA,
    ChaveMD5: "",
    PostedByRobot: true,
    LogPadronizado: false,
    Atributo: {
      DataVencimento: params.dataVencimento ?? "",
      DataCompetencia: params.dataCompetencia ?? "",
      Colaborador: "",
      Valor: params.valor ?? "",
      DataPublicacao: params.dataPublicacao ?? formatarDataPublicacao(),
      TipoCalculo: "",
    },
  };

  const resposta = await requisitar("POST", url, "Importar Documentos para o ZEN", TIMEOUT_DOCUMENTOS_MS, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const documentoId = await checarResposta(resposta, "Importar Documentos para o ZEN");
  if (typeof documentoId !== "string") {
    throw new QuestorZenError(
      `Resposta inesperada ao importar documento (esperava uma string com o ID do documento): ${JSON.stringify(documentoId)}`
    );
  }
  return semAspas(documentoId);
}

export interface ResultadoCadastro {
  codigoCategoria: string;
  codigoCliente: string;
  codigoArquivo: string;
  documentoId: string;
  nomeArquivo: string;
}

export interface ArquivoParaCadastro {
  /** Nome do arquivo (com extensão) — vira o "Titulo" do documento no Questor, sem a extensão. */
  nome: string;
  bytes: Uint8Array | Buffer;
}

/**
 * Cadastra VÁRIOS documentos no Edoc do Questor Zen via API, todos para a
 * mesma empresa — a categoria e o cliente são buscados uma única vez e
 * reaproveitados para todos os arquivos.
 *
 * `cnpj` vem do que `certidao-parser.extrairDadosCertidao` já extrai
 * (tipicamente a partir da Certidão de Inteiro Teor).
 *
 * Cada arquivo é registrado com "Titulo" igual ao próprio nome do arquivo
 * (sem extensão) — como o Robô Zen envia tipos de documento diferentes
 * (constituição, alteração contratual, distrato, certidão etc.), não faz
 * sentido usar um título fixo único para todos.
 *
 * Sem confirmação interativa aqui (ver nota no topo do arquivo) — quem
 * chama esta função já deve ter confirmado o envio antes (fluxo de token
 * de uso único nas rotas de API).
 */
export async function cadastrarContratos(
  cnpj: string,
  arquivos: ArquivoParaCadastro[]
): Promise<ResultadoCadastro[]> {
  if (arquivos.length === 0) {
    throw new QuestorZenError("Nenhum arquivo para cadastrar — lista vazia.");
  }
  if (!cnpj) {
    throw new QuestorZenError(
      "CNPJ não informado — não é possível buscar o cliente no Questor sem o CNPJ."
    );
  }

  const codigoCategoria = await buscarCodigoCategoria();
  const cliente = await consultarCliente(cnpj);
  const codigoCliente = cliente.CodigoCliente;

  const resultados: ResultadoCadastro[] = [];
  for (const arquivo of arquivos) {
    const titulo = arquivo.nome.replace(/\.[^./\\]+$/, "");
    const codigoArquivo = await uploadArquivo(arquivo.nome, arquivo.bytes);
    const documentoId = await importarDocumento({
      codigoCategoria,
      codigoCliente,
      codigoArquivo,
      titulo,
    });
    resultados.push({
      codigoCategoria,
      codigoCliente,
      codigoArquivo,
      documentoId,
      nomeArquivo: arquivo.nome,
    });
  }
  return resultados;
}

/**
 * Cadastra UM único contrato no Edoc do Questor Zen via API — atalho para
 * `cadastrarContratos()` com uma lista de um arquivo só.
 */
export async function cadastrarContrato(
  cnpj: string,
  arquivo: ArquivoParaCadastro
): Promise<ResultadoCadastro> {
  const [resultado] = await cadastrarContratos(cnpj, [arquivo]);
  return resultado;
}
