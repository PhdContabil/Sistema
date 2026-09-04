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
 * Lê uma consulta inteira, em páginas.
 *
 * O PostgREST corta a resposta em 1.000 linhas por padrão, SEM erro e SEM
 * aviso. Com ~2,7 mil empresas, isso fazia as decisões a partir da milésima
 * linha simplesmente sumirem da tela: o "OK" ficava gravado no banco e voltava
 * desmarcado. Toda leitura que possa passar de mil linhas precisa vir por aqui.
 */
const PAGINA = 1000;

export async function lerTudo<T>(
  monta: () => { range: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }> }
): Promise<T[]> {
  const tudo: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await monta().range(de, de + PAGINA - 1);
    if (error) break;
    const lote = (data ?? []) as T[];
    tudo.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return tudo;
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
  const lista = await lerTudo<Ajuste>(() =>
    sb.from("dissidio_ajustes").select("*").eq("ano", ano).order("codigoempresa")
  );
  const m = new Map<number, Ajuste>();
  for (const a of lista) m.set(a.codigoempresa, a);
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
  const lista = await lerTudo<MarcadorEmpresa>(() =>
    sb.from("dissidio_empresas").select("*").order("codigoempresa")
  );
  const m = new Map<number, MarcadorEmpresa>();
  for (const x of lista) m.set(x.codigoempresa, x);
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

  const [{ data: rodadas }, ajustes] = await Promise.all([
    sb.from("dissidio_rodadas").select("*").order("ano", { ascending: false }),
    lerTudo<Ajuste & { individual?: boolean }>(() =>
      sb.from("dissidio_ajustes")
        .select("ano,percentual,valor_novo,valor_base,origem,individual")
        .order("ano").order("codigoempresa")
    ),
  ]);

  const porAno = new Map<number, { n: number; ind: number; base: number; nova: number }>();
  for (const a of ajustes) {
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

  const lista = await lerTudo<Ajuste>(() =>
    sb.from("dissidio_ajustes").select("*").eq("ano", ano)
      .order("analisado_em", { ascending: false }).order("codigoempresa")
  );
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
