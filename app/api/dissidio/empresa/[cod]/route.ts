import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { getPerfilEmpresas } from "@/lib/questor";

export const dynamic = "force-dynamic";

/**
 * Serviços contratados de UMA empresa.
 *
 * A lista principal não pede `detalhado=true` — trazer os serviços das ~2,7 mil
 * empresas de uma vez pesava demais. Aqui buscamos só quando a linha é aberta.
 */
export async function GET(req: Request, { params }: { params: { cod: string } }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const cod = Number(params.cod);
  if (!Number.isInteger(cod) || cod <= 0) {
    return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
  }

  const ano = new Date().getFullYear();

  try {
    const r = await getPerfilEmpresas({
      anos: [ano],
      codigoempresa: cod,
      detalhado: true,
    });
    const e = r.dados?.[0];
    return NextResponse.json({ servicos: e?.servicos ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao consultar a API." },
      { status: 502 }
    );
  }
}
