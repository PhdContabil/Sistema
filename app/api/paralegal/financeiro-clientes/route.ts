import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { buscarClientesFinanceiro, QuestorError } from "@/lib/questor";

// Busca clientes que existem só no financeiro (cadastro avulso) — usado no
// "Buscar empresa" da OS. ?q= nome (3+ letras) ou CPF/CNPJ (só dígitos).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  if (!podeAcessarApp(nivel, "paralegal", "Controle")) {
    return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });
  }
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const digitos = q.replace(/\D/g, "");
  try {
    if (digitos.length === 11 || digitos.length === 14) {
      return NextResponse.json({ dados: await buscarClientesFinanceiro({ cpf_cnpj: digitos }) });
    }
    if (q.replace(/[\d\s.\-/]/g, "").length >= 3) {
      return NextResponse.json({ dados: await buscarClientesFinanceiro({ nome: q }) });
    }
    return NextResponse.json({ dados: [] });
  } catch (e) {
    const status = e instanceof QuestorError ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar o financeiro." }, { status });
  }
}
