import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { MODELOS_CONTRATO } from "@/lib/paralegal/modelos-contrato";

// Lista enxuta dos modelos (sem o texto, que é grande) — só para popular o seletor.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  if (!podeAcessarApp(nivel, "paralegal", "Controle")) {
    return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });
  }
  const itens = MODELOS_CONTRATO.map((m) => ({ codigo: m.codigo, modelo: m.modelo.trim(), temTexto: m.conteudo.length > 0 }));
  return NextResponse.json({ itens });
}
