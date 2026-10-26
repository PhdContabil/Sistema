import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { getEmpresas, hasApiKey } from "@/lib/questor";

// Societário · lista de empresas do Questor para o "Novo processo" (só consulta).
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  if (!hasApiKey()) return NextResponse.json({ error: "API Questor não configurada no servidor." }, { status: 500 });
  try {
    const r = await getEmpresas(false);
    const itens = (r.dados as unknown as Record<string, unknown>[]).map((e) => ({
      codigo: Number(e.codigoempresa),
      nome: String(e.nomeempresa ?? e.nome ?? ""),
      doc: String(e.inscrfederal ?? e.cnpj ?? "").replace(/\D/g, ""),
      ativa: e.ativa !== false,
    }));
    return NextResponse.json({ itens }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar a API Questor." }, { status: 502 });
  }
}
