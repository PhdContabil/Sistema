import { NextResponse } from "next/server";
import { getAnaliseLimite, hasApiKey, QuestorError } from "@/lib/questor";
import { SAMPLE_LIMITE } from "@/lib/sample-fiscal";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ano = searchParams.get("ano");
  const cnpj = searchParams.get("cnpj") ?? undefined;

  if (!hasApiKey()) {
    return NextResponse.json({ ...SAMPLE_LIMITE, fonte: "exemplo" });
  }

  try {
    const data = await getAnaliseLimite({
      ano: ano ? Number(ano) : undefined,
      cnpj,
    });
    return NextResponse.json({ ...data, fonte: "api" });
  } catch (err) {
    const status = err instanceof QuestorError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status });
  }
}
