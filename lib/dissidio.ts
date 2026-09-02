// Análise de Dissídio — acesso a dados (SERVIDOR).
//
// Duas fontes distintas, de propósito:
//  - PERFIL da empresa (faturamento, empregados, horas, mensalidade vigente)
//    vem da API Questor em tempo real. Não copiamos nada para cá.
//  - DECISÃO do reajuste (percentual, valor novo, observações, autoria) é
//    nossa e mora no Supabase, por ano.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Ajuste, Rodada, MarcadorEmpresa } from "./dissidio-tipos";

export * from "./dissidio-tipos";
export * from "./dissidio-calculo";

export function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false },
    global: {
      // O Next intercepta o fetch e guarda a resposta no Data Cache. Como o
      // supabase-js não passa `cache`, uma rodada excluída continuava
      // aparecendo no Histórico mesmo com a tabela vazia. Aqui a leitura é
      // sempre ao vivo — é dado transacional, não conteúdo estático.
      fetch: (entrada, init) => fetch(entrada, { ...init, cache: "no-store" }),
    },
  });
}

/**
 * Rodada do ano, se existir. SOMENTE LEITURA — de propósito.
 *
 * Antes esta função criava a rodada ao abrir a tela, e isso tinha um efeito
 * colateral ruim: excluir uma rodada no Histórico não adiantava, porque a
 * primeira pessoa que abrisse a Análise daquele ano a recriava vazia. A rodada
 * passa a nascer só quando alguém salva uma versão.
 */
export async function obterRodada(ano: number): Promise<Rodada | null> {
  const sb = db();
  if (!sb) return null;
  const { data } = await sb.from("dissidio_rodadas").select("*").eq("ano", ano).maybeSingle();
  return (data as Rodada) ?? null;
}

export async function listarAjustes(ano: number): Promise<Map<number, Ajuste>> {
  const sb = db();
  if (!sb) return new Map();
  const { data } = await sb.from("dissidio_ajustes").select("*").eq("ano", ano);
  const m = new Map<number, Ajuste>();
  for (const a of (data ?? []) as Ajuste[]) m.set(a.codigoempresa, a);
  return m;
}

export async function salvarRodada(
  ano: number,
  campos: { percentual_geral?: number; observacao?: string | null; fechada?: boolean },
  email: string
) {
  const sb = db();
  if (!sb) return { error: "Banco indisponível." };
  const { error } = await sb
    .from("dissidio_rodadas")
    .update({ ...campos, atualizada_em: new Date().toISOString(), atualizada_por: email })
    .eq("ano", ano);
  return { error: error?.message ?? null };
}

export async function salvarAjuste(
  ano: number,
  codigoempresa: number,
  campos: Partial<Pick<Ajuste, "percentual" | "valor_novo" | "valor_base" | "origem" | "observacao">>,
  email: string
) {
  const sb = db();
  if (!sb) return { error: "Banco indisponível." };
  const { error } = await sb.from("dissidio_ajustes").upsert(
    {
      ano,
      codigoempresa,
      ...campos,
      analisado_por: email,
      analisado_em: new Date().toISOString(),
    },
    { onConflict: "ano,codigoempresa" }
  );
  return { error: error?.message ?? null };
}

/** Marcadores permanentes (blacklist / responsável) de todas as empresas. */
export async function listarMarcadores(): Promise<Map<number, MarcadorEmpresa>> {
  const sb = db();
  if (!sb) return new Map();
  const { data } = await sb.from("dissidio_empresas").select("*");
  const m = new Map<number, MarcadorEmpresa>();
  for (const x of (data ?? []) as MarcadorEmpresa[]) m.set(x.codigoempresa, x);
  return m;
}

/**
 * Reajuste aplicado em cada ano, por empresa — alimenta o indicador de
 * variação ano a ano na tabela. Vem do nosso histórico de rodadas, não da API.
 */
export async function percentuaisPorAno(
  anos: number[]
): Promise<Map<number, Record<number, number>>> {
  const sb = db();
  if (!sb || anos.length === 0) return new Map();

  const { data } = await sb
    .from("dissidio_ajustes")
    .select("ano,codigoempresa,percentual,valor_novo,valor_base,origem")
    .in("ano", anos);

  const m = new Map<number, Record<number, number>>();
  for (const a of (data ?? []) as Ajuste[]) {
    const base = Number(a.valor_base ?? 0);
    // Quem informou valor tem o percentual derivado da base congelada.
    const pct =
      a.percentual !== null
        ? Number(a.percentual)
        : a.valor_novo !== null && base > 0
          ? ((Number(a.valor_novo) - base) / base) * 100
          : null;
    if (pct === null) continue;

    const atual = m.get(a.codigoempresa) ?? {};
    atual[a.ano] = Math.round(pct * 100) / 100;
    m.set(a.codigoempresa, atual);
  }
  return m;
}

export interface ResumoRodada {
  ano: number;
  percentual_geral: number;
  fechada: boolean;
  observacao: string | null;
  atualizada_em: string | null;
  atualizada_por: string | null;
  empresas: number;
  com_ajuste: number;
  soma_base: number;
  soma_nova: number;
}

/**
 * Resumo de cada rodada, para comparar anos.
 *
 * Calculado a partir do que ficou CONGELADO em `dissidio_ajustes`
 * (`valor_base` na data da decisão), não do honorário vigente hoje — senão o
 * histórico mudaria sozinho toda vez que um contrato fosse renegociado.
 */
export async function resumoRodadas(): Promise<ResumoRodada[]> {
  const sb = db();
  if (!sb) return [];

  const [{ data: rodadas }, { data: ajustes }] = await Promise.all([
    sb.from("dissidio_rodadas").select("*").order("ano", { ascending: false }),
    sb.from("dissidio_ajustes").select("ano,percentual,valor_novo,valor_base,origem,individual"),
  ]);

  const porAno = new Map<number, { n: number; ind: number; base: number; nova: number }>();
  for (const a of (ajustes ?? []) as (Ajuste & { individual?: boolean })[]) {
    const acc = porAno.get(a.ano) ?? { n: 0, ind: 0, base: 0, nova: 0 };
    const base = Number(a.valor_base ?? 0);
    const nova =
      a.origem === "valor" && a.valor_novo !== null
        ? Number(a.valor_novo)
        : a.percentual !== null
          ? base * (1 + Number(a.percentual) / 100)
          : base;
    acc.n += 1;
    if (a.individual) acc.ind += 1;
    acc.base += base;
    acc.nova += nova;
    porAno.set(a.ano, acc);
  }

  return ((rodadas ?? []) as Rodada[]).map((r) => {
    const acc = porAno.get(r.ano) ?? { n: 0, ind: 0, base: 0, nova: 0 };
    return {
      ano: r.ano,
      percentual_geral: Number(r.percentual_geral),
      fechada: r.fechada,
      observacao: r.observacao,
      atualizada_em: r.atualizada_em ?? null,
      atualizada_por: r.atualizada_por ?? null,
      empresas: acc.n,
      com_ajuste: acc.ind,
      soma_base: acc.base,
      soma_nova: acc.nova,
    };
  });
}

/** Ajustes de um ano, com o nome de quem analisou já resolvido. */
export async function historicoDoAno(ano: number) {
  const sb = db();
  if (!sb) return [];

  const { data } = await sb
    .from("dissidio_ajustes").select("*").eq("ano", ano).order("analisado_em", { ascending: false });
  const lista = (data ?? []) as Ajuste[];
  if (lista.length === 0) return [];

  const emails = [...new Set(lista.map((a) => a.analisado_por).filter(Boolean) as string[])];
  const nomes = new Map<string, string>();
  if (emails.length > 0) {
    const { data: p } = await sb.from("pessoas_perfil").select("email,nome").in("email", emails);
    for (const x of (p ?? []) as { email: string; nome: string }[]) {
      nomes.set(x.email.toLowerCase(), x.nome);
    }
  }
  return lista.map((a) => ({
    ...a,
    analista_nome: a.analisado_por ? (nomes.get(a.analisado_por.toLowerCase()) ?? a.analisado_por) : null,
  }));
}

/** Remove o ajuste individual — a empresa volta a seguir o percentual geral. */
export async function removerAjuste(ano: number, codigoempresa: number) {
  const sb = db();
  if (!sb) return { error: "Banco indisponível." };
  const { error } = await sb
    .from("dissidio_ajustes").delete()
    .eq("ano", ano).eq("codigoempresa", codigoempresa);
  return { error: error?.message ?? null };
}
