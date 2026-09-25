import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { listarDebitos, competenciasDisponiveis } from "@/lib/dare-sp";
import { exigirFiscal } from "./_auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  noStore();

  const email = await exigirFiscal();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });

  const competencia = new URL(req.url).searchParams.get("competencia") ?? undefined;

  try {
    const [debitos, competencias] = await Promise.all([
      listarDebitos(competencia || undefined),
      competenciasDisponiveis(),
    ]);
    return NextResponse.json({ debitos, competencias });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao listar débitos." },
      { status: 500 }
    );
  }
}
