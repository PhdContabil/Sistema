// Paralegal · Procurações — regras puras (sem rede, sem banco), testáveis.
//
// O retorno do OBTERPROCURACAO41 é uma lista por serviço com a data de
// expiração (AAAAMMDD). Vale a MENOR data (a mais restritiva). A situação de
// exibição é recalculada a partir da data, porque a gravada envelhece.

export interface ServicoProcuracao {
  dtexpiracao: string | null;   // AAAA-MM-DD
  sistemas: string[];
  nrsistemas?: number;
}

export type Vigencia = "em_dia" | "vencendo" | "vencida" | "sem_procuracao" | "erro" | "nunca";

export const DIAS_ALERTA = 90;

/** "20300502" -> "2030-05-02" */
export function parseDataExp(s: unknown): string | null {
  const t = String(s ?? "").replace(/\D/g, "");
  return t.length === 8 ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : null;
}

/** Interpreta o `dados` do OBTERPROCURACAO41 (já parseado). */
export function interpretarRetorno(lista: unknown, hoje: string) {
  if (!Array.isArray(lista) || !lista.length) {
    return { situacao: "inexistente" as const, data_fim: null, servicos: [] as ServicoProcuracao[] };
  }
  const servicos: ServicoProcuracao[] = lista.map((x: { dtexpiracao?: unknown; sistemas?: unknown; nrsistemas?: number }) => ({
    dtexpiracao: parseDataExp(x.dtexpiracao),
    sistemas: Array.isArray(x.sistemas) ? x.sistemas.map(String) : [],
    nrsistemas: x.nrsistemas,
  }));
  const datas = servicos.map((s) => s.dtexpiracao).filter((d): d is string => !!d).sort();
  const data_fim = datas[0] ?? null;
  return { situacao: (!data_fim || data_fim >= hoje ? "ativa" : "vencida") as "ativa" | "vencida", data_fim, servicos };
}

export function diasAte(data: string | null, hoje: string): number | null {
  if (!data) return null;
  return Math.round((Date.parse(data) - Date.parse(hoje)) / 86_400_000);
}

/** Vigência atual a partir do que está gravado (a data manda, não a situação antiga). */
export function vigencia(p: { situacao: string | null; data_fim: string | null; ultima_consulta: string | null }, hoje: string): Vigencia {
  if (!p.ultima_consulta && !p.situacao) return "nunca";
  if (p.situacao === "erro") return "erro";
  if (p.situacao === "inexistente") return "sem_procuracao";
  const d = diasAte(p.data_fim, hoje);
  if (d == null) return "em_dia";
  if (d < 0) return "vencida";
  return d <= DIAS_ALERTA ? "vencendo" : "em_dia";
}
