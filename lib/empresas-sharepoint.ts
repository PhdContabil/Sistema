// Busca de pastas de empresas no SharePoint (SERVIDOR).
//
// Migrado do app-busca-empresas, que autenticava no navegador com um app Azure
// próprio e permissão DELEGADA. Aqui a leitura é feita pelo servidor com a
// credencial de aplicação que o Núcleo já usa (a mesma da presença do Teams),
// porque o site /sites/Empresas é aberto a todo o escritório — ninguém passa a
// ver o que não via. Se um dia houver pasta restrita, isto precisa voltar a ser
// delegado, senão o app furaria a permissão do SharePoint.

import { obterCredenciaisMS, tokenGraph } from "./pessoas/msconfig";

const GRAPH = "https://graph.microsoft.com/v1.0";

const HOSTNAME = process.env.SP_HOSTNAME || "phdcontabil.sharepoint.com";
const SITE_PATH = process.env.SP_SITE_PATH || "/sites/Empresas";
const PASTA_RAIZ = process.env.SP_ROOT_FOLDER ?? "EMPRESAS";

export interface ItemSP {
  id: string;
  name: string;
  webUrl: string;
  ehPasta: boolean;
  qtdItens?: number | null;
  tamanho?: number | null;
  modificadoEm?: string | null;
  /** Grupo de origem, quando a empresa estava dentro de uma pasta "Grupo ...". */
  grupo?: { id: string; name: string } | null;
}

interface GraphItem {
  id: string;
  name: string;
  webUrl: string;
  folder?: { childCount?: number };
  file?: unknown;
  size?: number;
  lastModifiedDateTime?: string;
}

export class SharePointErro extends Error {
  status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.status = status;
  }
}

/** Traduz o erro do Graph para algo que a pessoa na tela entenda. */
function amigavel(status: number, corpo: string): string {
  if (status === 401) return "Credencial do Microsoft 365 inválida ou expirada.";
  if (status === 403) {
    return "O aplicativo não tem permissão para ler o SharePoint. "
      + "Falta conceder Sites.Read.All (tipo Aplicação) e o consentimento do administrador no Azure.";
  }
  if (status === 404) return `Site ou biblioteca não encontrada em ${HOSTNAME}${SITE_PATH}.`;
  if (status === 429) return "Muitas consultas em pouco tempo. Tente de novo em instantes.";
  return `Erro ${status} ao consultar o SharePoint: ${corpo.slice(0, 200)}`;
}

async function graph<T>(token: string, caminho: string): Promise<T> {
  const url = caminho.startsWith("http") ? caminho : GRAPH + caminho;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    throw new SharePointErro(amigavel(r.status, corpo), r.status);
  }
  return (await r.json()) as T;
}

async function obterToken(): Promise<string> {
  const cred = await obterCredenciaisMS();
  if (cred.origem === "ausente") {
    throw new SharePointErro("Credenciais do Microsoft 365 não configuradas no servidor.", 500);
  }
  const token = await tokenGraph(cred);
  if (!token) throw new SharePointErro("Não foi possível obter o token do Microsoft Graph.", 401);
  return token;
}

const CAMPOS = "$select=id,name,webUrl,folder,file,size,lastModifiedDateTime&$top=200";

async function filhos(token: string, driveId: string, itemId: string | null): Promise<GraphItem[]> {
  const base = itemId
    ? `/drives/${driveId}/items/${itemId}/children`
    : `/drives/${driveId}/root/children`;

  let url: string | null = `${GRAPH}${base}?${CAMPOS}`;
  const todos: GraphItem[] = [];
  while (url) {
    const p: { value?: GraphItem[]; "@odata.nextLink"?: string } = await graph(token, url);
    todos.push(...(p.value ?? []));
    url = p["@odata.nextLink"] ?? null;
  }
  return todos;
}

/** Comparação sem acento e sem caixa — "São Paulo" acha "sao paulo". */
export function normalizar(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function converter(i: GraphItem, grupo?: { id: string; name: string } | null): ItemSP {
  return {
    id: i.id,
    name: i.name,
    webUrl: i.webUrl,
    ehPasta: !!i.folder,
    qtdItens: i.folder?.childCount ?? null,
    tamanho: i.size ?? null,
    modificadoEm: i.lastModifiedDateTime ?? null,
    grupo: grupo ?? null,
  };
}

function ordenar(itens: ItemSP[]): ItemSP[] {
  return [...itens].sort((a, b) => {
    const pa = a.ehPasta ? 0 : 1;
    const pb = b.ehPasta ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return (a.name || "").localeCompare(b.name || "", "pt-BR");
  });
}

let cacheDrive: { id: string; em: number } | null = null;
const TTL_DRIVE = 30 * 60 * 1000;

async function obterDriveId(token: string): Promise<string> {
  if (cacheDrive && Date.now() - cacheDrive.em < TTL_DRIVE) return cacheDrive.id;
  const site = await graph<{ id: string }>(token, `/sites/${HOSTNAME}:${SITE_PATH}`);
  const drive = await graph<{ id: string }>(token, `/sites/${site.id}/drive`);
  cacheDrive = { id: drive.id, em: Date.now() };
  return drive.id;
}

/**
 * Lista as empresas.
 *
 * Regra herdada do app original: pastas cujo nome começa com "grupo" não são
 * empresas — são agrupamentos. O conteúdo delas sobe para a lista, com a marca
 * do grupo, para que a busca por nome da empresa funcione direto.
 */
export async function listarEmpresas(): Promise<{ driveId: string; empresas: ItemSP[] }> {
  const token = await obterToken();
  const driveId = await obterDriveId(token);

  let pastas = (await filhos(token, driveId, null)).filter((i) => i.folder);

  // Desce para a pasta raiz configurada (ex.: EMPRESAS), quando existir.
  let raiz = PASTA_RAIZ
    ? pastas.find((p) => normalizar(p.name) === normalizar(PASTA_RAIZ))
    : undefined;
  if (!raiz && pastas.length === 1) raiz = pastas[0];
  if (raiz) pastas = (await filhos(token, driveId, raiz.id)).filter((i) => i.folder);

  const ehGrupo = (i: GraphItem) => normalizar(i.name).startsWith("grupo");
  const grupos = pastas.filter(ehGrupo);
  let lista: ItemSP[] = pastas.filter((p) => !ehGrupo(p)).map((p) => converter(p));

  if (grupos.length > 0) {
    const dentro = await Promise.all(
      grupos.map(async (g) => {
        try {
          return (await filhos(token, driveId, g.id))
            .filter((i) => i.folder)
            .map((i) => converter(i, { id: g.id, name: g.name }));
        } catch {
          // Um grupo inacessível não pode derrubar a listagem inteira.
          return [] as ItemSP[];
        }
      })
    );
    for (const bloco of dentro) lista = lista.concat(bloco);
  }

  return { driveId, empresas: ordenar(lista) };
}

/** Conteúdo de uma pasta (subpastas e arquivos). */
export async function listarPasta(driveId: string, itemId: string): Promise<ItemSP[]> {
  const token = await obterToken();
  return ordenar((await filhos(token, driveId, itemId)).map((i) => converter(i)));
}

// ---------------------------------------------------------------- exibição

export function formatTamanho(b: number | null | undefined): string {
  if (b === null || b === undefined) return "";
  const un = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < un.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${un[i]}`;
}

export function iconeArquivo(nome: string): string {
  const e = (nome.split(".").pop() || "").toLowerCase();
  if (e === "pdf") return "📕";
  if (["doc", "docx"].includes(e)) return "📘";
  if (["xls", "xlsx", "csv"].includes(e)) return "📗";
  if (["ppt", "pptx"].includes(e)) return "📙";
  if (["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"].includes(e)) return "🖼️";
  if (["zip", "rar", "7z"].includes(e)) return "🗜️";
  return "📄";
}
