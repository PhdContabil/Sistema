import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { salvarRodada, salvarAjuste, removerAjuste, num } from "@/lib/dissidio";

export const dynamic = "force-dynamic";

function anoValido(v: string): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 2020 && n <= 2100 ? n : null;
}

/**
 * Atualiza a rodada do ano (percentual geral / observação) ou o ajuste de uma
 * empresa. Autoria vem sempre da sessão, nunca do corpo da requisição.
 */
export async function PATCH(req: Request, { params }: { params: { ano: string } }) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const ano = anoValido(params.ano);
  if (!ano) return NextResponse.json({ error: "Ano inválido." }, { status: 400 });

  let body: {
    alvo?: "rodada" | "empresa";
    percentual_geral?: unknown;
    observacao?: string | null;
    fechada?: boolean;
    codigoempresa?: number;
    percentual?: unknown;
    valor_novo?: unknown;
    valor_base?: unknown;
    limpar?: boolean;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  // ---- rodada do ano
  if (body.alvo === "rodada") {
    const campos: { percentual_geral?: number; observacao?: string | null; fechada?: boolean } = {};

    if (body.percentual_geral !== undefined) {
      const p = num(body.percentual_geral);
      if (p === null) return NextResponse.json({ error: "Percentual inválido." }, { status: 400 });
      if (p < -100 || p > 1000) {
        return NextResponse.json({ error: "Percentual fora do intervalo aceitável." }, { status: 400 });
      }
      campos.percentual_geral = p;
    }
    if (body.observacao !== undefined) campos.observacao = body.observacao || null;
    if (typeof body.fechada === "boolean") campos.fechada = body.fechada;

    const { error } = await salvarRodada(ano, campos, email);
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ---- ajuste de uma empresa
  const cod = Number(body.codigoempresa);
  if (!Number.isInteger(cod) || cod <= 0) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  // Limpar = a empresa volta a seguir o percentual geral.
  if (body.limpar) {
    const { error } = await removerAjuste(ano, cod);
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json({ ok: true, removido: true });
  }

  const campos: Record<string, unknown> = {};
  let origem: "percentual" | "valor" | null = null;

  if (body.percentual !== undefined && body.percentual !== null && body.percentual !== "") {
    const p = num(body.percentual);
    if (p === null) return NextResponse.json({ error: "Percentual inválido." }, { status: 400 });
    if (p < -100 || p > 1000) {
      return NextResponse.json({ error: "Percentual fora do intervalo aceitável." }, { status: 400 });
    }
    campos.percentual = p;
    campos.valor_novo = null;
    origem = "percentual";
  }

  if (body.valor_novo !== undefined && body.valor_novo !== null && body.valor_novo !== "") {
    const v = num(body.valor_novo);
    if (v === null || v < 0) {
      return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
    }
    campos.valor_novo = v;
    campos.percentual = null;
    origem = "valor";
  }

  if (body.observacao !== undefined) campos.observacao = body.observacao || null;

  // Congela a mensalidade que serviu de base — se o contrato mudar depois,
  // o histórico continua explicável.
  if (body.valor_base !== undefined) campos.valor_base = num(body.valor_base);

  if (origem) campos.origem = origem;

  if (Object.keys(campos).length === 0) {
    return NextResponse.json({ error: "Nada para salvar." }, { status: 400 });
  }

  const { error } = await salvarAjuste(ano, cod, campos, email);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
