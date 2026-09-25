// Selic acumulada no mês, série 4390 do Banco Central (SGS).
//
// Duas armadilhas documentadas na integração original, ambas tratadas aqui:
//
//  1. O MÊS CORRENTE VEM PELA METADE. O BCB publica o acumulado parcial do mês
//     em andamento. Usar esse número daria juros menores que os devidos, e a
//     guia sairia a menos. Só entram meses ENCERRADOS.
//  2. A DATA VAI CRUA NA URL. Se as barras de `01/01/2017` forem escapadas
//     para %2F, o BCB devolve uma página HTML de erro em vez do JSON.

import type { SelicMensal } from "./dare-sp-calculo";

const SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4390/dados";

/** Primeiro mês que interessa: antes disso a Sefaz usa UFESP, não Selic. */
const INICIO = "01/11/2017";

export class SelicError extends Error {
  status: number;
  constructor(mensagem: string, status = 502) {
    super(mensagem);
    this.name = "SelicError";
    this.status = status;
  }
}

interface LinhaSGS { data: string; valor: string }

/** "01/07/2026" → "2026-07". */
export function competenciaDaLinha(data: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((data ?? "").trim());
  return m ? `${m[3]}-${m[2]}` : null;
}

/** "AAAA-MM" do mês corrente, no fuso de São Paulo. */
export function mesCorrente(agora = new Date()): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
  });
  return f.format(agora).slice(0, 7);
}

/**
 * Converte a resposta do SGS em mapa de competência → taxa, descartando o mês
 * corrente. Separado do fetch para poder ser testado sem rede.
 */
export function montarSerie(linhas: LinhaSGS[], agora = new Date()): SelicMensal {
  const corrente = mesCorrente(agora);
  const serie: SelicMensal = {};

  for (const l of linhas ?? []) {
    const comp = competenciaDaLinha(l?.data);
    if (!comp) continue;
    // Armadilha 1: o mês em andamento vem parcial.
    if (comp >= corrente) continue;
    const taxa = Number(String(l.valor).replace(",", "."));
    if (!Number.isFinite(taxa)) continue;
    serie[comp] = taxa;
  }
  return serie;
}

interface Cache { quando: number; serie: SelicMensal }
let cache: Cache | null = null;
const VALIDADE_MS = 12 * 60 * 60 * 1000;

/**
 * Série Selic mensal, em cache de 12 h.
 *
 * O cache é generoso porque a série só muda uma vez por mês; o que não pode é
 * uma tela de guias fazer uma ida ao BCB por linha da tabela.
 */
export async function obterSelic(forcar = false): Promise<SelicMensal> {
  const agora = Date.now();
  if (!forcar && cache && agora - cache.quando < VALIDADE_MS) return cache.serie;

  // Armadilha 2: a data vai crua, sem encodeURIComponent nas barras.
  const url = `${SGS}?formato=json&dataInicial=${INICIO}`;

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  } catch (e) {
    throw new SelicError(`Banco Central fora do ar: ${e instanceof Error ? e.message : "falha de rede"}`);
  }

  if (!res.ok) throw new SelicError(`Banco Central respondeu ${res.status}.`);

  const tipo = res.headers.get("content-type") ?? "";
  if (!tipo.includes("json")) {
    // Sintoma clássico da armadilha 2: HTML de erro no lugar do JSON.
    throw new SelicError("Banco Central devolveu HTML no lugar do JSON — confira o formato da data na URL.");
  }

  const linhas = (await res.json().catch(() => null)) as LinhaSGS[] | null;
  if (!Array.isArray(linhas)) throw new SelicError("Resposta do Banco Central em formato inesperado.");

  const serie = montarSerie(linhas);
  cache = { quando: agora, serie };
  return serie;
}

/** Competências que faltam na série, entre duas datas. Para avisar antes de emitir. */
export function mesesFaltando(serie: SelicMensal, de: string, ate: string): string[] {
  const p = (iso: string) => {
    const m = /^(\d{4})-(\d{2})/.exec(iso ?? "");
    return m ? { a: Number(m[1]), m: Number(m[2]) } : null;
  };
  const a = p(de);
  const b = p(ate);
  if (!a || !b) return [];

  const faltam: string[] = [];
  let ano = a.a, mes = a.m;
  while (ano < b.a || (ano === b.a && mes <= b.m)) {
    const k = `${ano}-${String(mes).padStart(2, "0")}`;
    if (typeof serie[k] !== "number") faltam.push(k);
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
  }
  return faltam;
}
