// Informe de Rendimentos — alterar e excluir um lançamento já gravado no Questor.
// Lógica PURA (sem rede, sem banco): monta os corpos das rotas novas da API
// (PATCH e POST .../excluir em /contabil/informe-rendimentos/{empresa}), as
// chaves de idempotência e lê do log os `seq` das linhas que o Núcleo gravou.

import { createHash } from "node:crypto";
import type { EntradaInforme, PlanoInforme, TipoInforme } from "./informe-rendimentos";

/** Linhas do informe como estão no Questor (o que a API chama de `atual`). */
export interface LinhasQuestor {
  ecf: Array<{ codigooperacaofis: number; seq: number; valoroutraoperacaofis: number }>;
  f100: Array<{ seq: number; valoroper: number }>;
}

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));
const arr = (v: unknown): Array<Record<string, unknown>> =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Array<Record<string, unknown>>) : [];

/**
 * Lê as linhas (com `seq`) de uma resposta da API guardada no log: serve tanto
 * para a resposta do lançamento quanto para a da alteração. Linhas com
 * `acao: "excluida"` não existem mais no Questor e ficam de fora.
 * Devolve null se não há nenhuma linha (informe zerado, registro importado do Access).
 */
export function linhasDaResposta(resposta: unknown): LinhasQuestor | null {
  if (!resposta || typeof resposta !== "object") return null;
  const r = resposta as Record<string, unknown>;
  const vivas = (l: Record<string, unknown>) => l.acao !== "excluida";
  const ecf = arr(r.ecf).filter(vivas)
    .map((l) => ({ codigooperacaofis: num(l.codigooperacaofis), seq: num(l.seq), valoroutraoperacaofis: num(l.valoroutraoperacaofis) }))
    .filter((l) => Number.isFinite(l.codigooperacaofis) && Number.isFinite(l.seq) && Number.isFinite(l.valoroutraoperacaofis));
  const f100 = arr(r.f100).filter(vivas)
    .map((l) => ({ seq: num(l.seq), valoroper: num(l.valoroper) }))
    .filter((l) => Number.isFinite(l.seq) && Number.isFinite(l.valoroper));
  return ecf.length === 0 && f100.length === 0 ? null : { ecf, f100 };
}

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 20);

/** A API exige o prefixo `informe-alterar:` (e `informe-excluir:`) na Idempotency-Key. */
export function chaveAlterar(idOrigem: number, e: EntradaInforme, regime: string): string {
  const v = [e.rendimento, e.demaisReceitas, e.dividendos, e.retencao].map((n) => n.toFixed(2)).join("|");
  return `informe-alterar:${e.codigoempresa}:${e.competencia}:${hash(`${idOrigem}|${e.tipo}|${regime}|${v}`)}`;
}

export function chaveExcluir(idOrigem: number, codigoempresa: number, competencia: string): string {
  return `informe-excluir:${codigoempresa}:${competencia}:${hash(String(idOrigem))}`;
}

export function corpoExcluir(
  d: { usuario: string; competencia: string; tipo: TipoInforme }, atual: LinhasQuestor
) {
  return { usuario: d.usuario, competencia: d.competencia, tipo: d.tipo, ecf: atual.ecf, f100: atual.f100 };
}

export function corpoAlterar(
  d: { usuario: string; competencia: string; tipo: TipoInforme; regime: string }, atual: LinhasQuestor, plano: PlanoInforme
) {
  return {
    usuario: d.usuario, competencia: d.competencia, regime: d.regime, tipo: d.tipo,
    atual,
    novo: {
      ecf: plano.ecf.map(({ rotulo: _r, ...l }) => l),
      f100: plano.f100.map(({ rotulo: _r, ...l }) => l),
    },
  };
}

/** Os quatro valores digitados são iguais aos do lançamento? (em centavos) */
export function mesmosValores(
  l: { rendimento: number; demais_receitas: number; dividendos: number; retencao: number }, e: EntradaInforme
): boolean {
  const c = (n: number) => Math.round(Number(n) * 100);
  return c(l.rendimento) === c(e.rendimento) && c(l.demais_receitas) === c(e.demaisReceitas)
    && c(l.dividendos) === c(e.dividendos) && c(l.retencao) === c(e.retencao);
}

/** Status do log em que o lançamento ainda vale no Questor (pode ser alterado ou excluído). */
export const STATUS_ATIVOS = ["lancado", "alterado"] as const;
export const ehStatusAtivo = (s: string) => (STATUS_ATIVOS as readonly string[]).includes(s);
