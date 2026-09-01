import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { listarPasta, SharePointErro } from "@/lib/empresas-sharepoint";

export const dynamic = "force-dynamic";

/** Conteúdo de uma pasta do SharePoint. Só para quem já está logado no Núcleo. */
export async function GET(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const driveId = searchParams.get("drive");
  const itemId = searchParams.get("item");
  if (!driveId || !itemId) {
    return NextResponse.json({ error: "Informe drive e item." }, { status: 400 });
  }

  try {
    return NextResponse.json({ itens: await listarPasta(driveId, itemId) });
  } catch (e) {
    const status = e instanceof SharePointErro ? e.status : 502;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao consultar o SharePoint." },
      { status }
    );
  }
}
