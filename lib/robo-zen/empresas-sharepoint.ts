// Reconhecimento de empresas nas pastas do SharePoint (site /sites/Empresas,
// pasta raiz EMPRESAS) — porta de `src/empresas.py` (+ o modo "sharepoint"
// de `src/sharepoint_client.py`) do Robô Zen original (Python).
//
// Reaproveita a MESMA credencial de aplicação Microsoft Graph e o MESMO
// site/biblioteca já usados por `lib/empresas-sharepoint.ts` (mesmas
// variáveis de ambiente SP_HOSTNAME/SP_SITE_PATH/SP_ROOT_FOLDER) — não
// precisa de um novo registro de aplicativo no Entra ID. É um módulo à
// parte (não importa daquele arquivo) porque o algoritmo de varredura é
// bem mais profundo/específico do que o usado pela aba "Documentos"
// (reconhecimento do padrão NomeDaEmpresa_Codigo, pastas ignoradas,
// subpastas "de passagem" como ParaLegal/Profissionais, busca de
// contratos com fallback em profundidade) — ver docstring de
// `src/empresas.py` no projeto original para o raciocínio completo.
//
// Diferença de arquitetura importante em relação ao Python: lá, o robô é
// um processo local de longa duração, então uma busca "ao vivo" (crawl
// completo de ~770 empresas) é só lenta, nunca estoura tempo. Aqui, cada
// chamada de API roda numa função serverless com tempo limitado
// (maxDuration) — por isso a varredura completa (`listarTodasEmpresas`/
// `localizarEmpresa`) deve ser usada com cautela: o fluxo principal
// ("Rodar simulação completa") processa uma pasta de 1º nível por vez,
// entre chamadas (ver `listarPastasTopo` + `processarPastaTopo`), com o
// progresso salvo em `robo_zen_simulacoes`/`robo_zen_simulacao_empresas` —
// é isso que faz o job incremental (app/api/paralegal/robo-zen/**)
// avançar aos pedaços em vez de rodar tudo numa chamada só.

import { obterCredenciaisMS, tokenGraph } from "../pessoas/msconfig";

const GRAPH = "https://graph.microsoft.com/v1.0";

const HOSTNAME = process.env.SP_HOSTNAME || "phdcontabil.sharepoint.com";
const SITE_PATH = process.env.SP_SITE_PATH || "/sites/Empresas";
const PASTA_RAIZ = process.env.SP_ROOT_FOLDER ?? "EMPRESAS";

export class RoboZenSharePointErro extends Error {
  status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.name = "RoboZenSharePointErro";
    this.status = status;
  }
}

function amigavel(status: number, corpo: string): string {
  if (status === 401) return "Credencial do Microsoft 365 inválida ou expirada.";
  if (status === 403) {
    return (
      "O aplicativo não tem permissão para ler o SharePoint. Falta conceder " +
      "Sites.Read.All (tipo Aplicação) e o consentimento do administrador no Azure."
    );
  }
  if (status === 404) return `Site, biblioteca ou pasta não encontrada em ${HOSTNAME}${SITE_PATH}.`;
  if (status === 429) return "Muitas consultas em pouco tempo ao SharePoint. Tente de novo em instantes.";
  return `Erro ${status} ao consultar o SharePoint: ${corpo.slice(0, 200)}`;
}

async function obterToken(): Promise<string> {
  const cred = await obterCredenciaisMS();
  if (cred.origem === "ausente") {
    throw new RoboZenSharePointErro("Credenciais do Microsoft 365 não configuradas no servidor.", 500);
  }
  const token = await tokenGraph(cred);
  if (!token) throw new RoboZenSharePointErro("Não foi possível obter o token do Microsoft Graph.", 401);
  return token;
}

let cacheDrive: { id: string; em: number } | null = null;
const TTL_DRIVE_MS = 30 * 60 * 1000;

async function graphGet<T>(token: string, caminho: string): Promise<T> {
  const url = caminho.startsWith("http") ? caminho : GRAPH + caminho;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    throw new RoboZenSharePointErro(amigavel(r.status, corpo), r.status);
  }
  return (await r.json()) as T;
}

async function obterDriveId(token: string): Promise<string> {
  if (cacheDrive && Date.now() - cacheDrive.em < TTL_DRIVE_MS) return cacheDrive.id;
  const site = await graphGet<{ id: string }>(token, `/sites/${HOSTNAME}:${SITE_PATH}`);
  const drive = await graphGet<{ id: string }>(token, `/sites/${site.id}/drive`);
  cacheDrive = { id: drive.id, em: Date.now() };
  return drive.id;
}

export interface ContextoGraph {
  token: string;
  driveId: string;
}

/** Autentica e resolve o drive do SharePoint uma única vez — reaproveite o
 * mesmo `ContextoGraph` para todas as chamadas de uma mesma requisição. */
export async function obterContextoGraph(): Promise<ContextoGraph> {
  const token = await obterToken();
  const driveId = await obterDriveId(token);
  return { token, driveId };
}

interface FilhoGraph {
  id: string;
  name: string;
  ehPasta: boolean;
}

interface RawGraphItem {
  id: string;
  name: string;
  folder?: unknown;
  file?: unknown;
}

/** Comparação simples (minúsculas, sem espaços nas pontas) — sem stripar
 * acento: usada onde o Python também não stripava (ex.: nomes de pasta
 * configurados literalmente, como em SUBPASTA_ESPECIFICA_DE_EMPRESAS). */
function normalizarSimples(s: string): string {
  return (s || "").trim().toLowerCase();
}

/** Minúsculas E sem acento — usada onde o Python usava
 * `unicodedata.normalize` (ex.: identificar a pasta-pai como
 * "ParaLegal"/"Legalização" na busca em profundidade de Contratos). */
function normalizarAcentos(s: string): string {
  return (s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

async function listarFilhos(ctx: ContextoGraph, itemId: string | null): Promise<FilhoGraph[]> {
  const base = itemId ? `/drives/${ctx.driveId}/items/${itemId}/children` : `/drives/${ctx.driveId}/root/children`;
  let url: string | null = `${GRAPH}${base}?$select=id,name,folder,file&$top=999`;
  const todos: FilhoGraph[] = [];
  while (url) {
    const dados: { value?: RawGraphItem[]; "@odata.nextLink"?: string } = await graphGet(ctx.token, url);
    for (const item of dados.value ?? []) {
      todos.push({ id: item.id, name: item.name, ehPasta: !!item.folder });
    }
    url = dados["@odata.nextLink"] ?? null;
  }
  todos.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return todos;
}

/** GET /drives/{driveId}/items/{itemId}/content — bytes do arquivo. */
export async function baixarConteudo(ctx: ContextoGraph, itemId: string): Promise<Uint8Array> {
  const url = `${GRAPH}/drives/${ctx.driveId}/items/${itemId}/content`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${ctx.token}` }, cache: "no-store" });
  if (!resp.ok) {
    const corpo = await resp.text().catch(() => "");
    throw new RoboZenSharePointErro(amigavel(resp.status, corpo), resp.status);
  }
  return new Uint8Array(await resp.arrayBuffer());
}

// ---------------------------------------------------------------------
// Reconhecimento do padrão de pastas de empresas: "NomeDaEmpresa_Codigo"
// ---------------------------------------------------------------------

// O código vem sempre depois do último "_", mas em algumas pastas (várias
// dentro de "Grupo O Barbeiro da Esquina" e "Grupo Prana") tem ainda uma
// observação entre parênteses depois do código, tipo "..._969 (Moema I e
// Pinheiros)" — o sufixo opcional no final aceita isso sem incluí-lo no
// código.
const PADRAO_PASTA_EMPRESA = /^(.+)_(\d+)(?:\s*\(.*\))?$/;

export function parseNomePasta(nomePasta: string): { nome: string; codigo: string } | null {
  const m = nomePasta.trim().match(PADRAO_PASTA_EMPRESA);
  if (!m) return null;
  return { nome: m[1].trim(), codigo: m[2] };
}

// Pastas dentro de EMPRESAS que o robô NUNCA deve tratar como empresa
// ativa (nem processar diretamente, nem procurar empresas dentro delas).
// - "Zz - Ex - Clientes": clientes antigos/inativos, confirmado com a Júlia.
// - "Grupo Prime": pedido explícito da Júlia para desconsiderar.
const PASTAS_IGNORADAS = new Set(["Zz - Ex - Clientes", "Grupo Prime"]);

// Algumas pastas-contêiner guardam as empresas de verdade só dentro de uma
// subpasta específica (não direto nela, nem em qualquer subpasta como as
// "Grupo ..." comuns). Confirmado com a Júlia:
// - "Grupo Shades Salon": as empresas ficam em .../Profissionais/<nome>_<codigo>
// - "Novadao Serviços de Beleza": mesma coisa — considerar só .../Profissionais/,
//   ignorando a subpasta "Empresa" (que não deve ser tratada como cliente aqui).
const SUBPASTA_ESPECIFICA_DE_EMPRESAS: Record<string, string> = {
  "Grupo Shades Salon": "Profissionais",
  "Novadao Serviços de Beleza": "Profissionais",
};

// Nomes de subpasta que valem a pena abrir "de passagem" atrás de mais
// empresas, mesmo quando a própria pasta não é uma empresa. Roda para TODA
// empresa (não só as de config.SUBPASTA_ESPECIFICA_DE_EMPRESAS) — visto em
// pelo menos 20 empresas diferentes no diagnóstico das 495 pastas do
// projeto original.
const NOMES_DE_PASSAGEM = new Set(["paralegal", "legalização", "legalizacao", "empresa"]);

/**
 * Diz se vale a pena descer nessa subpasta atrás de mais empresas.
 *
 * Pedido explícito da Júlia: pastas "Profissionais MEI" (ou "MEIs") NÃO
 * devem ser abertas — só as demais variações ("Profissionais",
 * "Profissionais ME", "Profissionais SN", "Profissionais Freelancer",
 * "PROFISSIONAIS" etc.).
 */
function valeAPenaAbrir(nomePasta: string): boolean {
  const nomeNormalizado = normalizarSimples(nomePasta);
  if (nomeNormalizado.includes("profission")) {
    return !nomeNormalizado.includes("mei");
  }
  return NOMES_DE_PASSAGEM.has(nomeNormalizado);
}

export interface Empresa {
  nome: string;
  codigo: string;
  /** Id do item no Graph — a pasta da empresa. */
  itemId: string;
  /** Caminho legível (relativo a EMPRESAS), para diagnóstico — ex.:
   * "Grupo ACM/ACM Alcopla Comércio de Chapas_576". */
  caminho: string;
  /** Nome da pasta "Grupo ..." de 1º nível de onde essa empresa veio, se houver. */
  grupoNome: string | null;
}

const PROFUNDIDADE_MAXIMA_EMPRESAS = 6;

/**
 * Coleta empresas a partir de uma pasta — porta de `_coletar_empresas` do
 * Python. Se a própria pasta bater com o padrão NomeDaEmpresa_Codigo, ela
 * já entra como uma empresa; além disso, sempre olhamos as subpastas: se
 * uma bater com o padrão (empresa "irmã", como dentro de um "Grupo ...")
 * ou for uma pasta "de passagem" (ver `valeAPenaAbrir`), descemos nela
 * recursivamente — sem entrar em pastas irrelevantes (Contábil, RH,
 * Fiscal, Senhas etc.), o que mantém isso rápido mesmo em pastas de
 * empresa com milhares de arquivos.
 */
async function coletarEmpresas(
  ctx: ContextoGraph,
  itemIdPasta: string,
  nomePasta: string,
  caminhoAtual: string,
  grupoNome: string | null,
  profundidadeMaxima: number = PROFUNDIDADE_MAXIMA_EMPRESAS
): Promise<Empresa[]> {
  const empresas: Empresa[] = [];

  const parsed = parseNomePasta(nomePasta);
  if (parsed) {
    empresas.push({
      nome: parsed.nome,
      codigo: parsed.codigo,
      itemId: itemIdPasta,
      caminho: caminhoAtual,
      grupoNome,
    });
  }

  if (profundidadeMaxima <= 0) return empresas;

  let subitens: FilhoGraph[];
  try {
    subitens = await listarFilhos(ctx, itemIdPasta);
  } catch {
    return empresas;
  }

  for (const sub of subitens) {
    if (!sub.ehPasta) continue;
    const batePadrao = parseNomePasta(sub.name) !== null;
    if (batePadrao || valeAPenaAbrir(sub.name)) {
      const subEmpresas = await coletarEmpresas(
        ctx,
        sub.id,
        sub.name,
        `${caminhoAtual}/${sub.name}`,
        grupoNome,
        profundidadeMaxima - 1
      );
      empresas.push(...subEmpresas);
    }
  }
  return empresas;
}

export interface PastaTopo {
  id: string;
  name: string;
}

let cachePastaRaiz: { id: string; em: number } | null = null;
const TTL_RAIZ_MS = 30 * 60 * 1000;

async function obterItemIdPastaRaiz(ctx: ContextoGraph): Promise<string> {
  if (cachePastaRaiz && Date.now() - cachePastaRaiz.em < TTL_RAIZ_MS) return cachePastaRaiz.id;

  const raizFilhos = await listarFilhos(ctx, null);
  const pastas = raizFilhos.filter((f) => f.ehPasta);
  let alvo = PASTA_RAIZ ? pastas.find((p) => normalizarSimples(p.name) === normalizarSimples(PASTA_RAIZ)) : undefined;
  if (!alvo && pastas.length === 1) alvo = pastas[0];
  if (!alvo) {
    throw new RoboZenSharePointErro(
      `Pasta raiz '${PASTA_RAIZ}' não encontrada em ${HOSTNAME}${SITE_PATH}.`,
      404
    );
  }
  cachePastaRaiz = { id: alvo.id, em: Date.now() };
  return alvo.id;
}

/**
 * Lista as pastas de 1º nível dentro de EMPRESAS — o "snapshot" usado como
 * ponto de partida da fase de mapeamento da simulação (barato: uma única
 * chamada de rede). Cada uma é processada depois, uma de cada vez (ou em
 * pequenos lotes) entre chamadas de API, via `processarPastaTopo`.
 */
export async function listarPastasTopo(ctx: ContextoGraph): Promise<PastaTopo[]> {
  const raizId = await obterItemIdPastaRaiz(ctx);
  const filhos = await listarFilhos(ctx, raizId);
  return filhos.filter((f) => f.ehPasta).map((f) => ({ id: f.id, name: f.name }));
}

/** Encontra, entre os filhos de `itemId`, uma pasta cujo nome bate
 * (comparação simples, sem acento) com `nomeAlvo`. */
async function encontrarSubpastaPorNome(
  ctx: ContextoGraph,
  itemId: string,
  nomeAlvo: string
): Promise<FilhoGraph | null> {
  const filhos = await listarFilhos(ctx, itemId);
  const alvoNormalizado = normalizarSimples(nomeAlvo);
  return filhos.find((f) => f.ehPasta && normalizarSimples(f.name) === alvoNormalizado) ?? null;
}

export interface ResultadoPastaTopo {
  empresas: Empresa[];
  /** false quando a pasta está em PASTAS_IGNORADAS, ou quando nem ela nem
   * nenhuma subpasta relevante geraram alguma empresa reconhecida. */
  reconhecida: boolean;
}

/**
 * Processa UMA pasta de 1º nível de EMPRESAS (porta do corpo de
 * `_processar_item_raiz`, dentro de `listar_empresas`, do Python) —
 * unidade de trabalho da fase de mapeamento incremental.
 */
export async function processarPastaTopo(ctx: ContextoGraph, pastaTopo: PastaTopo): Promise<ResultadoPastaTopo> {
  if (PASTAS_IGNORADAS.has(pastaTopo.name)) {
    return { empresas: [], reconhecida: false };
  }

  const subpastaEspecifica = SUBPASTA_ESPECIFICA_DE_EMPRESAS[pastaTopo.name];
  if (subpastaEspecifica) {
    const alvo = await encontrarSubpastaPorNome(ctx, pastaTopo.id, subpastaEspecifica);
    if (!alvo) return { empresas: [], reconhecida: false };
    const empresas = await coletarEmpresas(ctx, alvo.id, alvo.name, `${pastaTopo.name}/${alvo.name}`, null);
    return { empresas, reconhecida: empresas.length > 0 };
  }

  const grupoNome = normalizarSimples(pastaTopo.name).startsWith("grupo") ? pastaTopo.name : null;
  const empresas = await coletarEmpresas(ctx, pastaTopo.id, pastaTopo.name, pastaTopo.name, grupoNome);
  return { empresas, reconhecida: empresas.length > 0 };
}

/**
 * Crawl COMPLETO de EMPRESAS (todas as pastas de 1º nível, em paralelo —
 * mesma ideia do ThreadPoolExecutor do Python). Útil para uso pontual,
 * mas cuidado: com ~770 empresas isso pode facilmente estourar o
 * `maxDuration` de uma função da Vercel. O fluxo principal (simulação)
 * NÃO usa esta função — ele chama `listarPastasTopo` uma vez e depois
 * `processarPastaTopo` pasta por pasta, entre chamadas, salvando o
 * progresso no Supabase (ver app/api/paralegal/robo-zen/**).
 */
export async function listarTodasEmpresas(
  ctx: ContextoGraph
): Promise<{ empresas: Empresa[]; naoReconhecidas: string[] }> {
  const pastasTopo = await listarPastasTopo(ctx);
  const resultados = await Promise.all(pastasTopo.map((p) => processarPastaTopo(ctx, p)));

  const empresas: Empresa[] = [];
  const naoReconhecidas: string[] = [];
  resultados.forEach((r, i) => {
    empresas.push(...r.empresas);
    if (!r.reconhecida) naoReconhecidas.push(pastasTopo[i].name);
  });
  return { empresas, naoReconhecidas };
}

/**
 * Localiza uma empresa por nome (parcial, sem distinguir maiúsculas) ou
 * código — faz um crawl completo antes de procurar (mesmo comportamento
 * do Python: `listar_empresas` roda inteiro, e só depois filtra em
 * memória). Ver aviso de performance em `listarTodasEmpresas`; para a UI
 * de "consultar uma empresa específica", prefira buscar primeiro numa
 * simulação já concluída (tabela `robo_zen_simulacao_empresas`) e só cair
 * aqui como busca "ao vivo" sob pedido explícito.
 */
export async function localizarEmpresa(ctx: ContextoGraph, busca: string): Promise<Empresa | null> {
  const buscaNormalizada = busca.trim().toLowerCase();
  const { empresas } = await listarTodasEmpresas(ctx);
  for (const empresa of empresas) {
    if (buscaNormalizada === empresa.codigo) return empresa;
    if (empresa.nome.toLowerCase().includes(buscaNormalizada)) return empresa;
    const nomePasta = empresa.caminho.split("/").pop() ?? "";
    if (nomePasta.toLowerCase().includes(buscaNormalizada)) return empresa;
  }
  return null;
}

// ---------------------------------------------------------------------
// Listagem dos contratos de uma empresa
// ---------------------------------------------------------------------

// Dentro de cada pasta de empresa, os contratos costumam ficar em
// "ParaLegal/Contratos" — mas boa parte das empresas mais antigas usa
// nomes diferentes ("Legalização" em vez de "ParaLegal") e algumas ainda
// têm um nível extra "Empresa" antes disso. Testamos esses caminhos
// possíveis, nessa ordem, e usamos o primeiro que existir de verdade.
const CAMINHOS_CONTRATOS_CANDIDATOS: string[][] = [
  ["ParaLegal", "Contratos"],
  ["Legalização", "Contratos"],
  ["Empresa", "ParaLegal", "Contratos"],
  ["Empresa", "Legalização", "Contratos"],
];

const NOMES_PASTA_LEGAL = new Set(["paralegal", "legalizacao"]);

/** Resolve um caminho relativo (lista de nomes de subpasta, em ordem)
 * a partir de `itemIdBase`, navegando nível a nível — devolve o item do
 * último segmento se TODOS os segmentos existirem como pasta, ou `null`
 * assim que um deles não existir. */
async function resolverCaminho(
  ctx: ContextoGraph,
  itemIdBase: string,
  segmentos: string[]
): Promise<FilhoGraph | null> {
  let atual: FilhoGraph | null = null;
  let paiId = itemIdBase;
  for (const segmento of segmentos) {
    const filhos = await listarFilhos(ctx, paiId);
    const alvoNormalizado = normalizarSimples(segmento);
    const encontrado = filhos.find((f) => f.ehPasta && normalizarSimples(f.name) === alvoNormalizado);
    if (!encontrado) return null;
    atual = encontrado;
    paiId = encontrado.id;
  }
  return atual;
}

export interface ArquivoContrato {
  id: string;
  nome: string;
}

/**
 * Lista TODOS os arquivos dentro de `itemId`, em qualquer subpasta, até
 * `profundidadeMaxima` níveis — porta de `_arquivos_em_profundidade`.
 *
 * Usado especificamente para pastas de Contratos: em várias empresas os
 * PDFs não ficam direto dentro de "Contratos", mas numa (ou mais)
 * subpasta extra criada pra organizar por loja/filial. Como "Contratos" é
 * sempre uma pasta-folha (não tem outro tipo de documento/categoria
 * misturado lá dentro), é seguro pegar tudo recursivamente.
 */
async function arquivosEmProfundidade(
  ctx: ContextoGraph,
  itemId: string,
  profundidadeMaxima = 4
): Promise<ArquivoContrato[]> {
  const arquivos: ArquivoContrato[] = [];

  async function andar(id: string, restante: number): Promise<void> {
    const filhos = await listarFilhos(ctx, id);
    for (const item of filhos) {
      if (!item.ehPasta) {
        arquivos.push({ id: item.id, nome: item.name });
      } else if (restante > 0) {
        await andar(item.id, restante - 1);
      }
    }
  }

  await andar(itemId, profundidadeMaxima);
  arquivos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return arquivos;
}

/**
 * Acha TODAS as pastas chamadas "Contratos" dentro de `itemIdEmpresa` cujo
 * pai direto seja "ParaLegal" ou "Legalização" (com/sem acento, qualquer
 * caixa), em qualquer nível de profundidade — porta de
 * `_encontrar_pastas_contratos_em_profundidade`.
 *
 * Existe pra cobrir empresas com filial, onde o layout tem uma pasta
 * numerada extra na frente (ex.: "1 - Matriz/Legalização/Contratos",
 * "2 - Filial/ParaLegal/Contratos"). Só é chamada como fallback, quando o
 * caminho padrão (CAMINHOS_CONTRATOS_CANDIDATOS) não existir ou estiver
 * vazio.
 */
async function encontrarPastasContratosEmProfundidade(
  ctx: ContextoGraph,
  itemIdEmpresa: string,
  profundidadeMaxima = 4
): Promise<FilhoGraph[]> {
  const encontradas: FilhoGraph[] = [];
  const vistos = new Set<string>();

  async function andar(itemId: string, nomePai: string, restante: number): Promise<void> {
    const filhos = await listarFilhos(ctx, itemId);
    for (const item of filhos) {
      if (!item.ehPasta) continue;
      if (normalizarSimples(item.name) === "contratos" && NOMES_PASTA_LEGAL.has(normalizarAcentos(nomePai))) {
        if (!vistos.has(item.id)) {
          vistos.add(item.id);
          encontradas.push(item);
        }
      }
      if (restante > 0) {
        await andar(item.id, item.name, restante - 1);
      }
    }
  }

  await andar(itemIdEmpresa, "", profundidadeMaxima);
  encontradas.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return encontradas;
}

/**
 * Tenta os mesmos `CAMINHOS_CONTRATOS_CANDIDATOS`, mas um nível abaixo de
 * cada subpasta DIRETA da empresa — cobre o layout comum de empresa com
 * filial ("1 - Matriz/ParaLegal/Contratos", "2 - Filial/Legalização/
 * Contratos" etc.), onde os candidatos padrão nunca batem porque falta
 * exatamente esse nível "N - Matriz"/"N - Filial" no meio do caminho.
 *
 * Existe pra NÃO cair sempre no fallback caro
 * (`encontrarPastasContratosEmProfundidade`, que varre TODA a árvore da
 * empresa — inclusive pastas grandes e irrelevantes tipo Contábil/Fiscal/RH
 * — sem nenhum filtro de nome) só por causa dessa uma pasta a mais no
 * caminho. Visto travando de verdade em produção (empresa "Ferreira e
 * Machado", código 135): a pasta de Contratos fica em
 * "1 - Matriz/Legalização/Contratos", então nenhum candidato direto batia,
 * e a busca caía na varredura completa de "1 - Matriz" — que só em
 * Contábil+Fiscal+RH passa de 400MB nessa empresa — estourando os 60s da
 * função. Como aqui só testamos as subpastas DIRETAS da empresa (tipicamente
 * só "1 - Matriz"/"2 - Filial", 1-3 no total), o custo fica bem mais baixo:
 * poucas chamadas ao Graph, em vez de uma varredura recursiva de tudo.
 */
async function resolverCaminhoEmSubpastasDiretas(
  ctx: ContextoGraph,
  itemIdEmpresa: string
): Promise<FilhoGraph | null> {
  const subpastas = (await listarFilhos(ctx, itemIdEmpresa)).filter((f) => f.ehPasta);
  for (const subpasta of subpastas) {
    for (const candidato of CAMINHOS_CONTRATOS_CANDIDATOS) {
      const encontrado = await resolverCaminho(ctx, subpasta.id, candidato);
      if (encontrado) return encontrado;
    }
  }
  return null;
}

/**
 * Lista os arquivos dentro da(s) pasta(s) de Contratos da empresa — porta
 * de `listar_contratos`.
 *
 * Primeiro tenta o caminho padrão (rápido): o primeiro candidato de
 * `CAMINHOS_CONTRATOS_CANDIDATOS` que existir de verdade como pasta,
 * direto na pasta da empresa ou (`resolverCaminhoEmSubpastasDiretas`) um
 * nível abaixo de cada subpasta direta dela (empresa com filial). Se não
 * existir nenhum, ou existir mas estiver vazio, só então cai para a busca
 * exaustiva (`encontrarPastasContratosEmProfundidade`, cara — varre TODA a
 * árvore da empresa), juntando os arquivos de TODAS as pastas de Contratos
 * encontradas.
 */
export async function listarContratos(ctx: ContextoGraph, empresa: Empresa): Promise<ArquivoContrato[]> {
  let pastaContratos: FilhoGraph | null = null;
  for (const candidato of CAMINHOS_CONTRATOS_CANDIDATOS) {
    pastaContratos = await resolverCaminho(ctx, empresa.itemId, candidato);
    if (pastaContratos) break;
  }

  if (!pastaContratos) {
    pastaContratos = await resolverCaminhoEmSubpastasDiretas(ctx, empresa.itemId);
  }

  if (pastaContratos) {
    const arquivos = await arquivosEmProfundidade(ctx, pastaContratos.id);
    if (arquivos.length > 0) return arquivos;
  }

  const pastasExtras = await encontrarPastasContratosEmProfundidade(ctx, empresa.itemId);
  const vistos = new Set<string>();
  const arquivos: ArquivoContrato[] = [];
  for (const pastaExtra of pastasExtras) {
    for (const arquivo of await arquivosEmProfundidade(ctx, pastaExtra.id)) {
      if (!vistos.has(arquivo.id)) {
        vistos.add(arquivo.id);
        arquivos.push(arquivo);
      }
    }
  }
  arquivos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return arquivos;
}
