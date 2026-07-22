import { NextResponse } from "next/server";
import { getConciliacaoHonorarios, hasApiKey, QuestorError } from "@/lib/questor";
import { SAMPLE_DADOS } from "@/lib/sample";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cnpj = searchParams.get("cnpj") ?? undefined;

  // Sem chave configurada: devolve os dados de exemplo para validar o visual.
  if (!hasApiKey()) {
    return NextResponse.json({
      total: SAMPLE_DADOS.length,
      dados: SAMPLE_DADOS,
      fonte: "exemplo",
    });
  }

  try {
    const data = await getConciliacaoHonorarios(cnpj);
    return NextResponse.json({ ...data, fonte: "api" });
  } catch (err) {
    const status = err instanceof QuestorError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status });
  }
}
