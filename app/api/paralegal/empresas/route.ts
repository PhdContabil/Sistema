import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { getEmpresas, hasApiKey } from "@/lib/questor";

// Paralegal · Controle — Empresas. Não é uma lista própria: é o cadastro de
// empresas do Questor (mesma API já usada pelo resto do Núcleo), só consulta.
export const dynamic = "force-dynamic";

async function souAutorizado() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  return podeAcessarApp(nivel, "paralegal", "Controle");
}

export async function GET() {
  if (!(await souAutorizado())) return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });
  if (!hasApiKey()) return NextResponse.json({ error: "API Questor não configurada no servidor." }, { status: 500 });
  try {
    const r = await getEmpresas(true);
    return NextResponse.json({ itens: r.dados });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar a API Questor." }, { status: 502 });
  }
}
