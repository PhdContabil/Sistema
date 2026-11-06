import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { listarServicosTareffa } from "@/lib/societario/tareffaServicos";
import { buscarEmpresaErp } from "@/lib/tarefas-dp";

export const dynamic = "force-dynamic";

/** GET ?erp=1467-1 -> empresa · GET (sem erp) -> serviços ativos do Tareffa. */
export async function GET(req: Request) {
  const u = await getCurrentUser().catch(() => null);
  if (!u?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const erp = new URL(req.url).searchParams.get("erp");
  try {
    if (erp) return NextResponse.json({ empresa: await buscarEmpresaErp(erp) });
    return NextResponse.json({ servicos: await listarServicosTareffa() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
