import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { proximoCodigoCadastroEmpresa, QuestorError } from "@/lib/questor";

// Sugestão do próximo código de empresa livre — migrado de
// /api/questor/cadastro/proximo-codigo do Paralegal System.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  if (!podeAcessarApp(nivel, "paralegal", "Controle")) {
    return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const inicio = Number(searchParams.get("inicio") ?? "1") || 1;
  const fim = Number(searchParams.get("fim") ?? "1999") || 1999;

  try {
    const codigo = await proximoCodigoCadastroEmpresa(inicio, fim);
    return NextResponse.json({ dados: codigo ? [{ codigo }] : [] });
  } catch (e) {
    const status = e instanceof QuestorError ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar o Questor." }, { status });
  }
}
