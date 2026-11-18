// Fiscal · DCTFWeb — parâmetros da transmissão automática + últimas execuções.
import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { exigirDctfweb } from "../../dare-sp/_auth";
import { historicoRotina, obterParametros, salvarParametros } from "@/lib/dctfweb";

export const dynamic = "force-dynamic";

export async function GET() {
  noStore();
  if (!(await exigirDctfweb())) return NextResponse.json({ error: "Sem acesso à DCTFWeb (Fiscal ou Trabalhista)." }, { status: 403 });
  try {
    const [parametros, historico] = await Promise.all([obterParametros(), historicoRotina()]);
    return NextResponse.json({ parametros, historico, cronConfigurado: !!process.env.CRON_SECRET });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ler." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const email = await exigirDctfweb();
  if (!email) return NextResponse.json({ error: "Sem acesso à DCTFWeb (Fiscal ou Trabalhista)." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    return NextResponse.json({ ok: true, parametros: await salvarParametros(b, email) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao salvar." }, { status: 400 });
  }
}
