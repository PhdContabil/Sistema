// Fiscal · DCTFWeb sem movimento
//   GET  ?competencia=AAAA-MM                 -> registros da competência + ativas + ambiente
//   POST { acao: "apontar", competencia }     -> compara M-1 × M (Questor, grátis)
//   POST { acao: "enviar", id }               -> R-2099 sem movimento na EFD-Reinf
//   POST { acao: "conferir", id }             -> resultado do protocolo do R-2099
//   POST { acao: "transmitir", id }           -> DCTFWeb pelo Integra (pago, irreversível)
//   POST { acao: "dispensar", id }            -> tira da fila
//   POST { acao: "ambiente", valor: 1|2 }     -> produção / produção restrita
import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { exigirDctfweb } from "../../dare-sp/_auth";
import {
  apontar, conferir, definirAmbiente, dispensar, enviar, listarSemMovimento, transmitirDctf,
} from "@/lib/dctfweb-sem-movimento";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const falha = (e: unknown, padrao: string, status = 500) =>
  NextResponse.json({ error: e instanceof Error ? e.message : padrao }, { status });
const SEM_ACESSO = "Sem acesso à DCTFWeb (Fiscal ou Trabalhista).";

export async function GET(req: Request) {
  noStore();
  if (!(await exigirDctfweb())) return NextResponse.json({ error: SEM_ACESSO }, { status: 403 });
  try {
    const c = new URL(req.url).searchParams.get("competencia") ?? "";
    return NextResponse.json(await listarSemMovimento(c));
  } catch (e) {
    return falha(e, "Falha ao listar.");
  }
}

export async function POST(req: Request) {
  const email = await exigirDctfweb();
  if (!email) return NextResponse.json({ error: SEM_ACESSO }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { acao?: string; id?: number; competencia?: string; valor?: number };
  const id = Number(b.id);
  try {
    switch (b.acao) {
      case "apontar": return NextResponse.json({ ok: true, ...(await apontar(b.competencia ?? "", email)) });
      case "ambiente": await definirAmbiente(Number(b.valor), email); return NextResponse.json({ ok: true });
    }
    if (!id) return falha(null, "Informe o registro.", 400);
    switch (b.acao) {
      case "enviar": return NextResponse.json(await enviar(id, email));
      case "conferir": return NextResponse.json(await conferir(id));
      case "transmitir": return NextResponse.json(await transmitirDctf(id, email));
      case "dispensar": return NextResponse.json(await dispensar(id, email));
      default: return falha(null, "Ação inválida.", 400);
    }
  } catch (e) {
    return falha(e, "Falha na operação.");
  }
}
