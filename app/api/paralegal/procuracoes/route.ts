// Paralegal · Procurações
//   GET                                   -> carteira + procuração gravada (sem chamar a Receita)
//   POST { cnpj, razao_social }           -> consulta UMA empresa no e-CAC (SERPRO)
import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { ehResposta, exigirAcessoParalegal } from "@/lib/robo-zen/guard";
import { consultarProcuracao, listarCarteira } from "@/lib/procuracoes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  noStore();
  const u = await exigirAcessoParalegal();
  if (ehResposta(u)) return u;
  try {
    return NextResponse.json(await listarCarteira());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao listar." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const u = await exigirAcessoParalegal();
  if (ehResposta(u)) return u;
  const body = (await req.json().catch(() => ({}))) as { cnpj?: string; razao_social?: string | null };
  if (!body.cnpj) return NextResponse.json({ error: "Informe o CNPJ." }, { status: 400 });
  try {
    return NextResponse.json(await consultarProcuracao(body.cnpj, body.razao_social ?? null, u.email));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha na consulta." }, { status: 500 });
  }
}
