// Vercel Cron, dias úteis às 7h38 (10:38 UTC): manda à gestora do Paralegal o alerta
// diário do Painel Gerencial. Só roda com o CRON_SECRET.
// Destinatários: variável PAINEL_ALERTA_PARA (e-mails separados por vírgula); padrão: Flavia.
import { NextRequest, NextResponse } from "next/server";
import { enviarEmail } from "@/lib/pessoas/notificar";
import { carregarPainel } from "@/lib/paralegal/painel-dados";
import { emailAlertaDiario } from "@/lib/paralegal/painel-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const para = (process.env.PAINEL_ALERTA_PARA || "flavia@phdcontabil.com.br")
      .split(/[;,\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@phdcontabil\.com\.br$/.test(e));
    if (para.length === 0) return NextResponse.json({ ok: false, error: "PAINEL_ALERTA_PARA sem e-mail válido" }, { status: 500 });
    const { hoje, lista } = await carregarPainel();
    const m = emailAlertaDiario(lista, hoje);
    const res = await Promise.all(para.map((p) => enviarEmail(p, m.assunto, m.html)));
    const falhas = res.filter((x) => !x).length;
    return NextResponse.json({ ok: falhas === 0, enviados: res.length - falhas, falhas, processos: lista.length }, { status: falhas ? 502 : 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "falha" }, { status: 500 });
  }
}
