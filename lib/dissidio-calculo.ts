// Cálculo e formatação do dissídio. Módulo PURO — sem Supabase, sem rede.
// Fica separado para os testes rodarem sem dependências e para o componente
// de cliente poder importar sem arrastar credencial para o navegador.

import type { Ajuste } from "./dissidio-tipos.ts";

// ------------------------------------------------------------ cálculo

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function arredondar(v: number, casas = 2): number {
  const f = 10 ** casas;
  return Math.round(v * f) / f;
}

/**
 * Resolve o reajuste de uma empresa.
 *
 * Regra de precedência: ajuste individual manda; sem ele, vale o percentual
 * geral da rodada. Quem informou valor em reais tem o percentual derivado, e
 * vice-versa — sempre a partir da mensalidade vigente (`base`).
 */
export function calcular(
  base: number | null,
  percentualGeral: number,
  ajuste: Ajuste | undefined
): { percentual: number | null; valorNovo: number | null; diferenca: number | null; individual: boolean } {
  const b = base ?? null;

  if (ajuste) {
    if (ajuste.origem === "valor" && ajuste.valor_novo !== null) {
      const p = b && b > 0 ? ((ajuste.valor_novo - b) / b) * 100 : null;
      return {
        percentual: p === null ? null : arredondar(p, 3),
        valorNovo: ajuste.valor_novo,
        diferenca: b === null ? null : arredondar(ajuste.valor_novo - b),
        individual: true,
      };
    }
    if (ajuste.percentual !== null) {
      const v = b === null ? null : arredondar(b * (1 + ajuste.percentual / 100));
      return {
        percentual: ajuste.percentual,
        valorNovo: v,
        diferenca: v === null || b === null ? null : arredondar(v - b),
        individual: true,
      };
    }
  }

  const v = b === null ? null : arredondar(b * (1 + percentualGeral / 100));
  return {
    percentual: percentualGeral,
    valorNovo: v,
    diferenca: v === null || b === null ? null : arredondar(v - b),
    individual: false,
  };
}

// ------------------------------------------------------------ formatação

export function formatBRL(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatNum(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

export function formatPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

export function formatCNPJ(c: string | null | undefined): string {
  if (!c) return "";
  const d = c.replace(/\D/g, "").padStart(14, "0");
  if (d.length !== 14) return c;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Variação da mensalidade de um ano para o anterior, em %.
 *
 * É o reajuste que a empresa efetivamente levou, medido pelo próprio contrato:
 * compara o honorário vigente no fim de cada ano. Antes eu lia isso das rodadas
 * salvas aqui, o que só funcionaria para anos já analisados no sistema — e
 * deixava a coluna vazia. O contrato conta a história toda, inclusive dos anos
 * anteriores ao Núcleo existir.
 */
export function variacaoMensalidade(
  atual: number | null | undefined,
  anterior: number | null | undefined
): number | null {
  if (atual === null || atual === undefined) return null;
  if (anterior === null || anterior === undefined) return null;
  // Sem base não há percentual: sair de 0 para qualquer valor é infinito.
  if (anterior <= 0) return null;
  return arredondar(((atual - anterior) / anterior) * 100, 2);
}
