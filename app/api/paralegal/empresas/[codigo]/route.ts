import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { getEmpresaCadastroDetalhado, QuestorError } from "@/lib/questor";

// Detalhe de uma empresa (Questor) — migrado de consulta.html/empresa.js do
// Paralegal System.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { codigo: string } }) {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  if (!podeAcessarApp(nivel, "paralegal", "Controle")) {
    return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });
  }
  try {
    const empresa = await getEmpresaCadastroDetalhado(params.codigo);
    return NextResponse.json({ empresa });
  } catch (e) {
    const status = e instanceof QuestorError ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar a empresa." }, { status });
  }
}
