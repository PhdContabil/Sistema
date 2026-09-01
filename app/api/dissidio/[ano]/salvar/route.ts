import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { db, num } from "@/lib/dissidio";

export const dynamic = "force-dynamic";

interface LinhaEnviada {
  codigoempresa: number;
  percentual?: string | number | null;
  valor_novo?: string | number | null;
  valor_base?: number | null;
  observacao?: string | null;
  blacklist?: boolean;
  blacklist_motivo?: string | null;
  responsavel?: string | null;
  /** `analisado_em` que o navegador tinha quando carregou a linha. */
  visto_em?: string | null;
}

/**
 * Grava a versão do ano.
 *
 * Só chegam aqui as linhas que a pessoa REALMENTE mexeu — não a tela inteira.
 * Isso é o que permite três pessoas trabalharem ao mesmo tempo sem uma apagar
 * o trabalho da outra: quem não tocou numa empresa não a regrava.
 *
 * Para a mesma empresa vale o último que salvou, como combinado — mas
 * devolvemos a lista de `conflitos` (linhas que outra pessoa alterou depois de
 * você carregar a tela) para a interface poder avisar.
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

  let body: {
    percentual_geral?: unknown;
    observacao?: string | null;
    empresas?: LinhaEnviada[];
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const agora = new Date().toISOString();

  // ---- cabeçalho da rodada
  const campos: Record<string, unknown> = { atualizada_em: agora, atualizada_por: email };
  if (body.percentual_geral !== undefined) {
    const p = num(body.percentual_geral);
    if (p === null || p < -100 || p > 1000) {
      return NextResponse.json({ error: "Percentual geral inválido." }, { status: 400 });
    }
    campos.percentual_geral = p;
  }
  if (body.observacao !== undefined) campos.observacao = body.observacao || null;

  const { error: eRodada } = await sb.from("dissidio_rodadas").update(campos).eq("ano", ano);
  if (eRodada) return NextResponse.json({ error: eRodada.message }, { status: 500 });

  const linhas = Array.isArray(body.empresas) ? body.empresas : [];
  if (linhas.length === 0) return NextResponse.json({ ok: true, gravadas: 0, conflitos: [] });

  const codigos = linhas.map((l) => Number(l.codigoempresa)).filter((n) => Number.isInteger(n) && n > 0);

  // ---- quem mexeu nessas empresas depois de você carregar a tela?
  const { data: atuais } = await sb
    .from("dissidio_ajustes")
    .select("codigoempresa,analisado_por,analisado_em")
    .eq("ano", ano)
    .in("codigoempresa", codigos);

  const noBanco = new Map(
    (atuais ?? []).map((a: { codigoempresa: number; analisado_por: string | null; analisado_em: string }) =>
      [a.codigoempresa, a]
    )
  );

  const conflitos: { codigoempresa: number; por: string | null; em: string }[] = [];

  const paraAjuste: Record<string, unknown>[] = [];
  const paraMarcador: Record<string, unknown>[] = [];

  for (const l of linhas) {
    const cod = Number(l.codigoempresa);
    if (!Number.isInteger(cod) || cod <= 0) continue;

    const atual = noBanco.get(cod);
    if (atual && atual.analisado_por && atual.analisado_por.toLowerCase() !== email) {
      const visto = l.visto_em ? Date.parse(l.visto_em) : 0;
      if (Date.parse(atual.analisado_em) > visto) {
        conflitos.push({ codigoempresa: cod, por: atual.analisado_por, em: atual.analisado_em });
      }
    }

    // ---- parte versionada (o ajuste do ano)
    const mexeuNoAjuste =
      l.percentual !== undefined || l.valor_novo !== undefined || l.observacao !== undefined;

    if (mexeuNoAjuste) {
      const p = l.percentual === "" || l.percentual === null || l.percentual === undefined
        ? null : num(l.percentual);
      const v = l.valor_novo === "" || l.valor_novo === null || l.valor_novo === undefined
        ? null : num(l.valor_novo);

      if (p !== null && (p < -100 || p > 1000)) {
        return NextResponse.json(
          { error: `Percentual fora do intervalo na empresa ${cod}.` }, { status: 400 }
        );
      }
      if (v !== null && v < 0) {
        return NextResponse.json({ error: `Valor negativo na empresa ${cod}.` }, { status: 400 });
      }

      paraAjuste.push({
        ano,
        codigoempresa: cod,
        percentual: v !== null ? null : p,
        valor_novo: v,
        valor_base: l.valor_base ?? null,
        origem: v !== null ? "valor" : "percentual",
        observacao: l.observacao ?? null,
        analisado_por: email,
        analisado_em: agora,
      });
    }

    // ---- parte permanente (marcadores da empresa)
    const mexeuNoMarcador =
      l.blacklist !== undefined || l.responsavel !== undefined || l.blacklist_motivo !== undefined;

    if (mexeuNoMarcador) {
      paraMarcador.push({
        codigoempresa: cod,
        blacklist: l.blacklist ?? false,
        blacklist_motivo: l.blacklist_motivo ?? null,
        responsavel: l.responsavel || null,
        atualizado_por: email,
        atualizado_em: agora,
      });
    }
  }

  if (paraAjuste.length > 0) {
    const { error } = await sb.from("dissidio_ajustes").upsert(paraAjuste, { onConflict: "ano,codigoempresa" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (paraMarcador.length > 0) {
    const { error } = await sb.from("dissidio_empresas").upsert(paraMarcador, { onConflict: "codigoempresa" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    gravadas: paraAjuste.length,
    marcadores: paraMarcador.length,
    conflitos,
  });
}
