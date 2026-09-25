import { NextResponse } from "next/server";
import { montarGuia, receitaSugerida, type Regime } from "@/lib/dare-sp-calculo";
import { obterSelic, SelicError } from "@/lib/selic";
import { exigirFiscal } from "../_auth";

export const dynamic = "force-dynamic";

/**
 * Prévia: multa, juros e memória de cálculo para uma data de pagamento.
 * Não emite nada — é o que a tela mostra antes de alguém confirmar.
 */
export async function POST(req: Request) {
  const email = await exigirFiscal();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });

  let body: {
    principal?: number; vencimento?: string; pagamento?: string;
    codigoimposto?: string; regime?: Regime;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  if (!body.vencimento || !body.pagamento) {
    return NextResponse.json({ error: "Informe vencimento e data de pagamento." }, { status: 400 });
  }

  let selic;
  try {
    selic = await obterSelic();
  } catch (e) {
    const status = e instanceof SelicError ? e.status : 502;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao consultar a Selic." },
      { status }
    );
  }

  const guia = montarGuia(Number(body.principal ?? 0), body.vencimento, body.pagamento, selic);
  const receita = body.codigoimposto
    ? receitaSugerida(body.codigoimposto, body.regime ?? "simples")
    : null;

  return NextResponse.json({ ok: true, guia, receita });
}
