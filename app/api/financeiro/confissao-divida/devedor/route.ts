import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { getEmpresaCadastroDetalhado, QuestorError } from "@/lib/questor";

// Sugestão de devedor para o Termo de Confissão de Dívida: o primeiro sócio da
// empresa no Questor. Só devolve o nome — nacionalidade, profissão e endereço
// residencial a pessoa digita na tela (o cadastro do Questor não é fonte
// confiável do endereço de residência do sócio).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const nivel = await obterNivelAcesso(user.email);
  if (!podeAcessarApp(nivel, "financeiro", "Termo de Confissão de Dívida")) {
    return NextResponse.json({ error: "Sem acesso ao Financeiro." }, { status: 403 });
  }

  const cod = new URL(req.url).searchParams.get("codigoempresa")?.trim() ?? "";
  if (!/^\d+$/.test(cod)) return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });

  try {
    const d = await getEmpresaCadastroDetalhado(cod);
    const socio = (d.socios || d.quadrosocietario || [])[0];
    return NextResponse.json({ nome: socio?.nomesocio || socio?.nome || "" });
  } catch (e) {
    const status = e instanceof QuestorError ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar o Questor." }, { status });
  }
}
