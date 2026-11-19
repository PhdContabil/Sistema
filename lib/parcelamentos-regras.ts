// Parcelamentos do Simples Nacional — regras puras (sem rede). Rodam nos testes.
// Quatro modalidades com os mesmos serviços; muda idSistema e o código.

export type Modalidade = "PARCSN" | "PARCSN-ESP" | "PERTSN" | "RELPSN";

export const MODALIDADES: Record<Modalidade, { rotulo: string; pedidos: string; obter: string; parcelas: string; gerar: string }> = {
  "PARCSN":     { rotulo: "Simples - Ordinário", pedidos: "PEDIDOSPARC163", obter: "OBTERPARC164", parcelas: "PARCELASPARAGERAR162", gerar: "GERARDAS161" },
  "PARCSN-ESP": { rotulo: "Simples - Especial",  pedidos: "PEDIDOSPARC173", obter: "OBTERPARC174", parcelas: "PARCELASPARAGERAR172", gerar: "GERARDAS171" },
  "PERTSN":     { rotulo: "PERT-SN",             pedidos: "PEDIDOSPARC183", obter: "OBTERPARC184", parcelas: "PARCELASPARAGERAR182", gerar: "GERARDAS181" },
  "RELPSN":     { rotulo: "RELP-SN",             pedidos: "PEDIDOSPARC193", obter: "OBTERPARC194", parcelas: "PARCELASPARAGERAR192", gerar: "GERARDAS191" },
};
export const LISTA_MODALIDADES = Object.keys(MODALIDADES) as Modalidade[];
export const ehModalidade = (m: unknown): m is Modalidade => typeof m === "string" && m in MODALIDADES;

export interface PedidoParc { numero: number; dataDoPedido?: number; situacao?: string; dataDaSituacao?: number }

/** Ativos ("Em parcelamento") a partir do retorno do PEDIDOSPARC de cada modalidade. */
export function extrairAtivos(porModalidade: { modalidade: Modalidade; dados: unknown }[]) {
  const ativos: { modalidade: Modalidade; numero: number; situacao: string }[] = [];
  for (const { modalidade, dados } of porModalidade) {
    const lista = (dados as { parcelamentos?: PedidoParc[] } | null)?.parcelamentos ?? [];
    for (const p of lista) {
      if (/em parcelamento/i.test(p.situacao ?? "")) ativos.push({ modalidade, numero: Number(p.numero), situacao: p.situacao ?? "" });
    }
  }
  return ativos;
}

/** 202410 -> "10/2024" */
export const fmtComp = (n: number | string) => String(n).replace(/^(\d{4})(\d{2})$/, "$2/$1");
/** 20240220 -> "20/02/2024" */
export const fmtDataInt = (n: number | string | null | undefined) => n ? String(n).replace(/^(\d{4})(\d{2})(\d{2})$/, "$3/$2/$1") : "—";

/** Competência AAAAMM de hoje (fuso de SP). */
export function compAtual(agora = new Date()): number {
  const [a, m] = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).split("-");
  return Number(a) * 100 + Number(m);
}

/** PDF do GERARDAS: o nome do campo varia. */
export function pdfDoDas(dados: unknown): string | null {
  const d = (Array.isArray(dados) ? dados[0] : dados) as Record<string, unknown> | null;
  if (!d || typeof d !== "object") return null;
  for (const k of ["PDFByteArrayBase64", "pdf", "docArrecadacaoPdfB64", "arquivo"]) {
    if (typeof d[k] === "string" && (d[k] as string).length > 100) return d[k] as string;
  }
  return null;
}

/** Nome de arquivo seguro: RAZAO_MODALIDADE[_numero]_AAAAMM.pdf */
export function nomeArquivo(razao: string | null, cnpj: string, modalidade: string, parcela: number, numero?: number) {
  const base = (razao || cnpj).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
  return `${base}_${modalidade}${numero ? `_${numero}` : ""}_${parcela}.pdf`;
}
