// Cliente Graph para as listas do SharePoint do Paralegal System (migrado).
//
// No sistema antigo, cada função serverless (contrato.js, os-criar.js, ...)
// repetia o mesmo par "pega token -> pega o id da lista -> chama a lista",
// cada uma com sua própria constante LIST_NAME. Aqui isso vira um cliente
// único e genérico — cada tela do Núcleo só passa o nome da lista.
import { obterCredenciaisParalegalMS, tokenParalegalGraph } from "./msconfig";

const GRAPH = "https://graph.microsoft.com/v1.0";

// Id (ou hostname:path) do site do SharePoint onde vivem as listas
// ControleContrato, osfinanceiro, roteirotroca etc. Definido em env ou,
// como o resto das credenciais deste app, na tabela app_config.
const SITE_ID = process.env.PARALEGAL_SP_SITE_ID ?? "";

export class GraphErro extends Error {
  status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.status = status;
  }
}

function amigavel(status: number, corpo: string): string {
  if (status === 401) return "Credencial do Microsoft 365 (Paralegal) inválida ou expirada.";
  if (status === 403) {
    return "O aplicativo do Paralegal não tem permissão de escrita no SharePoint. "
      + "Falta Sites.ReadWrite.All (tipo Aplicação) e o consentimento do administrador no Azure.";
  }
  if (status === 404) return "Lista ou item não encontrado no SharePoint.";
  if (status === 429) return "Muitas consultas em pouco tempo. Tente de novo em instantes.";
  return `Erro ${status} ao falar com o SharePoint: ${corpo.slice(0, 200)}`;
}

async function obterToken(): Promise<string> {
  const cred = await obterCredenciaisParalegalMS();
  if (cred.origem === "ausente") {
    throw new GraphErro("Credenciais do Microsoft 365 do Paralegal não configuradas no servidor.", 500);
  }
  const token = await tokenParalegalGraph(cred);
  if (!token) throw new GraphErro("Não foi possível obter o token do Microsoft Graph (Paralegal).", 401);
  return token;
}

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  if (!SITE_ID) throw new GraphErro("PARALEGAL_SP_SITE_ID não configurado.", 500);
  const token = await obterToken();
  const url = caminho.startsWith("http") ? caminho : `${GRAPH}${caminho}`;
  const r = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    throw new GraphErro(amigavel(r.status, corpo), r.status);
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

const cacheListaId = new Map<string, { id: string; em: number }>();
const TTL_LISTA = 30 * 60 * 1000;

async function obterListaId(nomeLista: string): Promise<string> {
  const c = cacheListaId.get(nomeLista);
  if (c && Date.now() - c.em < TTL_LISTA) return c.id;
  const lista = await chamar<{ id: string }>(`/sites/${SITE_ID}/lists/${encodeURIComponent(nomeLista)}`);
  cacheListaId.set(nomeLista, { id: lista.id, em: Date.now() });
  return lista.id;
}

export interface ItemLista<F = Record<string, unknown>> {
  id: string;
  fields: F;
}

/** Lista todos os itens (paginando), com os campos de negócio (não os do SharePoint). */
export async function listarItens<F = Record<string, unknown>>(nomeLista: string): Promise<ItemLista<F>[]> {
  const listaId = await obterListaId(nomeLista);
  const itens: ItemLista<F>[] = [];
  let url: string | null =
    `${GRAPH}/sites/${SITE_ID}/lists/${listaId}/items?$expand=fields&$top=500`;
  while (url) {
    const p: { value?: ItemLista<F>[]; "@odata.nextLink"?: string } = await chamar(url);
    itens.push(...(p.value ?? []));
    url = p["@odata.nextLink"] ?? null;
  }
  return itens;
}

export async function obterItem<F = Record<string, unknown>>(nomeLista: string, itemId: string): Promise<ItemLista<F>> {
  const listaId = await obterListaId(nomeLista);
  return chamar<ItemLista<F>>(`/sites/${SITE_ID}/lists/${listaId}/items/${itemId}?$expand=fields`);
}

export async function criarItem<F extends Record<string, unknown>>(nomeLista: string, campos: F): Promise<ItemLista<F>> {
  const listaId = await obterListaId(nomeLista);
  return chamar<ItemLista<F>>(`/sites/${SITE_ID}/lists/${listaId}/items`, {
    method: "POST",
    body: JSON.stringify({ fields: campos }),
  });
}

export async function atualizarItem<F extends Record<string, unknown>>(
  nomeLista: string, itemId: string, campos: Partial<F>
): Promise<F> {
  const listaId = await obterListaId(nomeLista);
  return chamar<F>(`/sites/${SITE_ID}/lists/${listaId}/items/${itemId}/fields`, {
    method: "PATCH",
    body: JSON.stringify(campos),
  });
}

export async function excluirItem(nomeLista: string, itemId: string): Promise<void> {
  const listaId = await obterListaId(nomeLista);
  await chamar<void>(`/sites/${SITE_ID}/lists/${listaId}/items/${itemId}`, { method: "DELETE" });
}

/** Envia e-mail pelo Graph (Mail.Send), em nome da caixa configurada no app. Usado no envio de OS. */
export async function enviarEmail(opts: {
  remetente: string; // UPN/e-mail da caixa que envia (precisa Mail.Send de aplicação sobre ela)
  para: string[];
  assunto: string;
  corpoHtml: string;
  anexos?: { nome: string; conteudoBase64: string; tipoMime?: string }[];
}): Promise<void> {
  const token = await obterToken();
  const r = await fetch(`${GRAPH}/users/${encodeURIComponent(opts.remetente)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: opts.assunto,
        body: { contentType: "HTML", content: opts.corpoHtml },
        toRecipients: opts.para.map((e) => ({ emailAddress: { address: e } })),
        attachments: (opts.anexos ?? []).map((a) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: a.nome,
          contentType: a.tipoMime ?? "application/pdf",
          contentBytes: a.conteudoBase64,
        })),
      },
      saveToSentItems: true,
    }),
  });
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    throw new GraphErro(amigavel(r.status, corpo), r.status);
  }
}
