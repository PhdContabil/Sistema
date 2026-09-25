// Cliente da Web API DARE-ICMS da Sefaz-SP (SERVIDOR).
//
// Contrato e armadilhas vêm do documento técnico da integração (25/09/2026).
// As três que custaram caro, e que estão tratadas aqui:
//
//  1. O ERRO CHEGA COM HTTP 200. Uma receita inválida devolve
//     {"erro":{"mensagens":[...]}} com status 200 e SEM o campo `estaOk`,
//     porque a API omite campos com valor padrão. Por isso sucesso é
//     "lista de mensagens vazia", e nunca `estaOk === true`.
//  2. A API NÃO CALCULA multa e juros. O `valorTotal` é só a soma do que
//     mandamos — o cálculo é nosso (lib/dare-sp-calculo.ts).
//  3. A RECEITA VAI INTEIRA no corpo, não só o código: reenviamos o objeto
//     exato que veio do GET /receitas.
//
// Mais dois cuidados: o corpo precisa ir em UTF-8 (latin-1 derruba a Sefaz
// com HTTP 500 por causa de acento no nome da receita) e a resposta passa de
// 400 KB, porque o PDF vem embutido no JSON.

const BASE = process.env.SEFAZ_SP_DARE_BASE_URL || "https://apigateway.fazenda.sp.gov.br/dare-icms";
const CHAVE = process.env.SEFAZ_SP_DARE_API_KEY;

export class SefazError extends Error {
  status: number;
  /** Mensagens que a Sefaz devolveu, já em português — vão direto para a tela. */
  mensagens: string[];
  constructor(mensagem: string, status: number, mensagens: string[] = []) {
    super(mensagem);
    this.name = "SefazError";
    this.status = status;
    this.mensagens = mensagens;
  }
}

export function temChaveSefaz(): boolean {
  return Boolean(CHAVE);
}

export function ambienteSefaz(): "producao" | "homologacao" {
  return BASE.includes("-hml") ? "homologacao" : "producao";
}

/** Receita do catálogo. Reenviada inteira na emissão — ver armadilha 3. */
export interface ReceitaSefaz {
  codigo: string;
  codigoServicoDARE: number;
  escopoUso: number;
  nome: string;
}

interface RespostaComErro {
  erro?: { mensagens?: string[] };
  mensagens?: string[];
}

/**
 * Extrai as mensagens de erro de qualquer formato que a Sefaz use.
 *
 * Separado e exportado porque é a regra da armadilha 1 — e o único jeito de
 * testá-la sem bater na Sefaz.
 */
export function mensagensDeErro(corpo: unknown): string[] {
  if (!corpo || typeof corpo !== "object") return [];
  const c = corpo as RespostaComErro;
  const lista = c.erro?.mensagens ?? c.mensagens ?? [];
  return Array.isArray(lista) ? lista.filter((m): m is string => typeof m === "string" && m.trim() !== "") : [];
}

/** Sucesso é ausência de mensagens, NÃO `estaOk === true`. Ver armadilha 1. */
export function deuCerto(corpo: unknown): boolean {
  return mensagensDeErro(corpo).length === 0;
}

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  if (!CHAVE) {
    throw new SefazError(
      "Chave da Sefaz-SP não configurada (SEFAZ_SP_DARE_API_KEY).",
      412
    );
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${caminho}`, {
      ...init,
      headers: {
        "api-key": CHAVE,
        Accept: "application/json",
        // charset explícito: o corpo com acento precisa ir em UTF-8.
        ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (e) {
    throw new SefazError(
      `Sefaz-SP fora do ar: ${e instanceof Error ? e.message : "falha de rede"}`,
      502
    );
  }

  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new SefazError(
      `Sefaz-SP respondeu ${res.status}${texto ? `: ${texto.slice(0, 300)}` : ""}`,
      res.status >= 500 ? 502 : res.status
    );
  }

  const corpo = (await res.json().catch(() => null)) as T | null;
  if (corpo === null) throw new SefazError("Sefaz-SP devolveu um corpo ilegível.", 502);

  // Armadilha 1: o erro vem com HTTP 200.
  const msgs = mensagensDeErro(corpo);
  if (msgs.length > 0) throw new SefazError(msgs.join(" "), 422, msgs);

  return corpo;
}

// ---------------------------------------------------------------- receitas

interface CacheReceitas { quando: number; dados: ReceitaSefaz[] }
let cacheReceitas: CacheReceitas | null = null;
const VALIDADE_RECEITAS_MS = 24 * 60 * 60 * 1000;

/**
 * Catálogo de receitas do DARE (39 hoje), em cache de 24 h.
 *
 * O catálogo muda raramente e a emissão precisa do objeto inteiro; buscar a
 * cada guia seria uma ida à Sefaz por clique, sem ganho nenhum.
 */
export async function listarReceitas(forcar = false): Promise<ReceitaSefaz[]> {
  const agora = Date.now();
  if (!forcar && cacheReceitas && agora - cacheReceitas.quando < VALIDADE_RECEITAS_MS) {
    return cacheReceitas.dados;
  }

  const corpo = await chamar<{ receitas?: ReceitaSefaz[] } | ReceitaSefaz[]>("/receitas");
  const dados = Array.isArray(corpo) ? corpo : (corpo.receitas ?? []);
  cacheReceitas = { quando: agora, dados };
  return dados;
}

/** Acha a receita pelo código de serviço (ex.: 4602). */
export async function acharReceita(codigoServico: number): Promise<ReceitaSefaz | null> {
  const todas = await listarReceitas();
  return todas.find((r) => Number(r.codigoServicoDARE) === Number(codigoServico)) ?? null;
}

// ---------------------------------------------------------------- emissão

export interface DadosEmissao {
  dataVencimento: string;
  receita: ReceitaSefaz;
  referencia: string;
  valor: number;
  valorMulta: number;
  valorJuros: number;
  cnpj: string;
  razaoSocial: string;
  endereco: string;
  cidade: string;
  uf?: string;
  telefone?: string;
}

export interface GuiaEmitida {
  /** PDF oficial em base64. */
  documentoImpressao: string;
  codigoBarra44: string | null;
  codigoBarra48: string | null;
  pixCopiaCola: string | null;
  numeroControle: string | null;
  valorTotal: number;
}

/**
 * Emite uma guia. O `valorTotal` que volta é só a soma do que mandamos
 * (armadilha 2) — conferimos contra a nossa conta e avisamos se divergir,
 * porque divergência aqui significa guia com valor diferente do calculado.
 */
export async function emitirGuia(d: DadosEmissao): Promise<GuiaEmitida> {
  const corpo = {
    dataVencimento: `${d.dataVencimento}T00:00:00`,
    receita: d.receita,
    referencia: d.referencia,
    valor: d.valor,
    valorMulta: d.valorMulta,
    valorJuros: d.valorJuros,
    cnpj: (d.cnpj ?? "").replace(/\D/g, ""),
    razaoSocial: d.razaoSocial,
    endereco: d.endereco,
    cidade: d.cidade,
    uf: d.uf ?? "SP",
    telefone: (d.telefone ?? "").replace(/\D/g, ""),
    gerarPDF: true,
  };

  const r = await chamar<Record<string, unknown>>("/dare-unitario/emitir", {
    method: "POST",
    body: JSON.stringify(corpo),
  });

  const texto = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v : null;

  return {
    documentoImpressao: texto(r.documentoImpressao) ?? "",
    codigoBarra44: texto(r.codigoBarra44),
    codigoBarra48: texto(r.codigoBarra48),
    pixCopiaCola: texto(r.pixCopiaCola),
    numeroControle: texto(r.numeroControleDarePrincipal),
    valorTotal: Number(r.valorTotal ?? 0),
  };
}

/**
 * Confere o total da Sefaz contra o nosso.
 *
 * Tolerância de um centavo, de propósito: a Sefaz trunca e nós arredondamos
 * para cima. Diferença maior que isso é erro de verdade e precisa aparecer.
 */
export function totalConfere(daSefaz: number, nosso: number): boolean {
  // A folga de 1e-9 é contra ponto flutuante: |1150 - 1150.01| dá
  // 0.010000000000218, que uma comparação crua com 0.01 recusaria.
  return Math.abs(Number(daSefaz) - Number(nosso)) <= 0.01 + 1e-9;
}
