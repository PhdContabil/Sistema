import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { getEstabelecimentos, QuestorError } from "@/lib/questor";

// Estabelecimentos (matriz + filiais) de uma empresa do Questor — usado na busca da O.S.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { codigo: string } }) {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  if (!podeAcessarApp(nivel, "paralegal", "Controle")) return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });
  try {
    return NextResponse.json({ dados: await getEstabelecimentos(params.codigo) });
  } catch (e) {
    const status = e instanceof QuestorError ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar a empresa." }, { status });
  }
}
