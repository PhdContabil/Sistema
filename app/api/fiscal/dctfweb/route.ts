import { NextResponse } from "next/server";
import { getDctfwebObrigadas, hasApiKey, QuestorError } from "@/lib/questor";
import { SAMPLE_DCTFWEB } from "@/lib/sample-fiscal";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ano = searchParams.get("ano");
  const mes = searchParams.get("mes");
  const origem = searchParams.get("origem") ?? undefined;
  const cnpj = searchParams.get("cnpj") ?? undefined;

  if (!hasApiKey()) {
    return NextResponse.json({ ...SAMPLE_DCTFWEB, fonte: "exemplo" });
  }

  try {
    const data = await getDctfwebObrigadas({
      ano: ano ? Number(ano) : undefined,
      mes: mes ? Number(mes) : undefined,
      origem,
      cnpj,
    });
    return NextResponse.json({ ...data, fonte: "api" });
  } catch (err) {
    const status = err instanceof QuestorError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status });
  }
}
