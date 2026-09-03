import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { db, num, arredondar } from "@/lib/dissidio";
import { getPerfilEmpresas } from "@/lib/questor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface LinhaEnviada {
  codigoempresa: number;
  percentual?: string | number | null;
  valor_novo?: string | number | null;
  valor_base?: number | null;
  observacao?: string | null;
  blacklist?: boolean;
  blacklist_motivo?: string | null;
  responsavel?: string | null;
  grupo?: string | null;
  definido?: boolean;
  visto_em?: string | null;
}

/**
 * Grava a versão do ano.
 *
 * Duas coisas acontecem aqui, e a ordem importa:
 *
 * 1. As linhas que a pessoa editou entram como decisão INDIVIDUAL. Só essas
 *    vêm do navegador — é o que permite três pessoas trabalharem ao mesmo
 *    tempo sem uma apagar o trabalho da outra.
 *
 * 2. Depois, o retrato é completado: toda empresa que ainda não tem decisão
 *    individual recebe uma linha derivada do percentual geral. Assim o
 *    histórico fica auditável empresa a empresa, e não só nas exceções.
 *
 * Decisões individuais de OUTRAS pessoas nunca são sobrescritas pelo passo 2 —
 * ele só toca em quem está seguindo a regra geral.
 */
export async function POST(req: Request, { params }: { params: { ano: string } }) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const ano = Number(params.ano);
  if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) {
    return NextResponse.json({ error: "Ano inválido." }, { status: 400 });
  }

  const sb = db();
  if (!sb) return NextResponse.json({ error: "Banco indisponível." }, { status: 500 });

  let body: { percentual_geral?: unknown; observacao?: string | null; empresas?: LinhaEnviada[] };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const agora = new Date().toISOString();

  // ---- cabeçalho da rodada
  //
  // É AQUI que a rodada nasce — não ao abrir a tela. Só existe rodada de um ano
  // se alguém tiver salvado uma versão dele; caso contrário, excluir no
  // Histórico não teria efeito, porque a próxima visita recriaria o registro.
  const { data: existente } = await sb
    .from("dissidio_rodadas").select("percentual_geral,criada_por").eq("ano", ano).maybeSingle();

  let percentualGeral = Number(existente?.percentual_geral ?? 0);
  if (body.percentual_geral !== undefined) {
    const p = num(body.percentual_geral);
    if (p === null || p < -100 || p > 1000) {
      return NextResponse.json({ error: "Percentual geral inválido." }, { status: 400 });
    }
    percentualGeral = p;
  }

  const { error: eRodada } = await sb.from("dissidio_rodadas").upsert(
    {
      ano,
      percentual_geral: percentualGeral,
      observacao: body.observacao !== undefined ? (body.observacao || null) : undefined,
      criada_por: existente?.criada_por ?? email,
      atualizada_em: agora,
      atualizada_por: email,
    },
    { onConflict: "ano" }
  );
  if (eRodada) return NextResponse.json({ error: eRodada.message }, { status: 500 });

  const linhas = Array.isArray(body.empresas) ? body.empresas : [];

  // ---- 1) o que a pessoa editou
  const conflitos: { codigoempresa: number; por: string | null; em: string }[] = [];
  const paraAjuste: Record<string, unknown>[] = [];
  const paraMarcador: Record<string, unknown>[] = [];
  const paraApagar: number[] = [];

  if (linhas.length > 0) {
    const codigos = linhas.map((l) => Number(l.codigoempresa)).filter((n) => Number.isInteger(n) && n > 0);
    const { data: atuais } = await sb
      .from("dissidio_ajustes")
      .select("codigoempresa,analisado_por,analisado_em,individual")
      .eq("ano", ano)
      .in("codigoempresa", codigos);

    const noBanco = new Map(
      (atuais ?? []).map((a: { codigoempresa: number; analisado_por: string | null; analisado_em: string; individual: boolean }) =>
        [a.codigoempresa, a]
      )
    );

    for (const l of linhas) {
      const cod = Number(l.codigoempresa);
      if (!Number.isInteger(cod) || cod <= 0) continue;

      const atual = noBanco.get(cod);
      if (atual?.individual && atual.analisado_por && atual.analisado_por.toLowerCase() !== email) {
        const visto = l.visto_em ? Date.parse(l.visto_em) : 0;
        if (Date.parse(atual.analisado_em) > visto) {
          conflitos.push({ codigoempresa: cod, por: atual.analisado_por, em: atual.analisado_em });
        }
      }

      const temPct = l.percentual !== undefined && l.percentual !== null && l.percentual !== "";
      const temVal = l.valor_novo !== undefined && l.valor_novo !== null && l.valor_novo !== "";
      const mexeuNoAjuste = l.percentual !== undefined || l.valor_novo !== undefined || l.observacao !== undefined;

      if (mexeuNoAjuste) {
        const p = temPct ? num(l.percentual) : null;
        const v = temVal ? num(l.valor_novo) : null;

        if (p !== null && (p < -100 || p > 1000)) {
          return NextResponse.json({ error: `Percentual fora do intervalo na empresa ${cod}.` }, { status: 400 });
        }
        if (v !== null && v < 0) {
          return NextResponse.json({ error: `Valor negativo na empresa ${cod}.` }, { status: 400 });
        }

        // Limpou os dois campos e não escreveu observação: volta a seguir o
        // percentual geral — a linha é recriada no passo 2.
        if (!temPct && !temVal && !l.observacao && !l.definido) {
          paraApagar.push(cod);
        } else {
          const base = l.valor_base ?? null;
          const valorFinal = v !== null
            ? v
            : p !== null && base !== null ? arredondar(base * (1 + p / 100)) : null;

          paraAjuste.push({
            ano, codigoempresa: cod,
            percentual: v !== null ? null : p,
            valor_novo: valorFinal,
            valor_base: base,
            origem: v !== null ? "valor" : "percentual",
            individual: temPct || temVal,
            definido: l.definido ?? false,
            observacao: l.observacao ?? null,
            analisado_por: email,
            analisado_em: agora,
          });
        }
      }

      if (l.blacklist !== undefined || l.responsavel !== undefined
          || l.blacklist_motivo !== undefined || l.grupo !== undefined) {
        paraMarcador.push({
          codigoempresa: cod,
          blacklist: l.blacklist ?? false,
          blacklist_motivo: l.blacklist_motivo ?? null,
          responsavel: l.responsavel || null,
          grupo: l.grupo ? String(l.grupo).trim().toUpperCase() : null,
          atualizado_por: email,
          atualizado_em: agora,
        });
      }
    }

    if (paraApagar.length > 0) {
      await sb.from("dissidio_ajustes").delete().eq("ano", ano).in("codigoempresa", paraApagar);
    }
    if (paraAjuste.length > 0) {
      const { error } = await sb.from("dissidio_ajustes").upsert(paraAjuste, { onConflict: "ano,codigoempresa" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (paraMarcador.length > 0) {
      const { error } = await sb.from("dissidio_empresas").upsert(paraMarcador, { onConflict: "codigoempresa" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // ---- 2) completa o retrato com quem segue o percentual geral
  let derivadas = 0;
  try {
    const perfil = await getPerfilEmpresas({ anos: [Math.min(ano, new Date().getFullYear())] });

    // Preserva tanto decisão individual quanto empresa já marcada como OK —
    // regravar pela regra geral apagaria o "definido" de quem já foi analisado.
    const { data: individuais } = await sb
      .from("dissidio_ajustes").select("codigoempresa,individual,definido").eq("ano", ano);
    const temDecisao = new Set(
      (individuais ?? [])
        .filter((x: { individual: boolean; definido: boolean }) => x.individual || x.definido)
        .map((x: { codigoempresa: number }) => x.codigoempresa)
    );

    const lote = (perfil.dados ?? [])
      .filter((e) => !temDecisao.has(e.codigoempresa))
      .map((e) => {
        const base = e.mensalidade?.total ?? null;
        return {
          ano,
          codigoempresa: e.codigoempresa,
          percentual: percentualGeral,
          valor_novo: base === null ? null : arredondar(base * (1 + percentualGeral / 100)),
          valor_base: base,
          origem: "percentual",
          individual: false,
          observacao: null,
          analisado_por: email,
          analisado_em: agora,
        };
      });

    // Em blocos: são milhares de linhas numa tacada só.
    for (let i = 0; i < lote.length; i += 500) {
      const { error } = await sb
        .from("dissidio_ajustes")
        .upsert(lote.slice(i, i + 500), { onConflict: "ano,codigoempresa" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    derivadas = lote.length;
  } catch (e) {
    // O que a pessoa digitou já foi gravado — avisamos que o retrato ficou parcial.
    return NextResponse.json({
      ok: true,
      gravadas: paraAjuste.length,
      derivadas: 0,
      conflitos,
      aviso: "Suas alterações foram salvas, mas não consegui completar o retrato das demais empresas: "
        + (e instanceof Error ? e.message : "falha na API Questor"),
    });
  }

  return NextResponse.json({
    ok: true,
    gravadas: paraAjuste.length,
    removidas: paraApagar.length,
    derivadas,
    conflitos,
  });
}
