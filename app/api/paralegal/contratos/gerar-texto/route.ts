import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { MODELOS_CONTRATO } from "@/lib/paralegal/modelos-contrato";
import { gerarTextoContrato, montarVariaveis } from "@/lib/paralegal/merge-contrato";
import { getEmpresaCadastroDetalhado, QuestorError } from "@/lib/questor";

// Mail-merge de contrato: recebe o código do modelo + código da empresa no
// Questor + data/valores, busca os dados da empresa no Questor e devolve o
// texto do contrato já com as variáveis substituídas. Migrado de
// contrato-form.js (gerarDoModelo) do Paralegal System.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  if (!podeAcessarApp(nivel, "paralegal", "Controle")) {
    return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });
  }

  let body: { codigoModelo?: number; codigoEmpresa?: string; dataIso?: string; valor1?: string; valor2?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  if (!body.codigoModelo) return NextResponse.json({ error: "Selecione um modelo." }, { status: 400 });
  if (!body.codigoEmpresa?.trim()) return NextResponse.json({ error: "Informe o código da empresa." }, { status: 400 });

  const modelo = MODELOS_CONTRATO.find((m) => m.codigo === body.codigoModelo);
  if (!modelo || !modelo.conteudo) {
    return NextResponse.json({ error: "Esse modelo ainda não tem texto cadastrado." }, { status: 400 });
  }

  try {
    const empresa = await getEmpresaCadastroDetalhado(body.codigoEmpresa.trim());
    const dataIso = body.dataIso || new Date().toISOString().slice(0, 10);
    const texto = gerarTextoContrato(modelo.conteudo, empresa, { dataIso, valor1: body.valor1, valor2: body.valor2 });
    const vars = montarVariaveis(empresa, {});
    return NextResponse.json({ texto, razaoSocial: vars.nomecliente, cnpj: vars.inscrfederal });
  } catch (e) {
    const status = e instanceof QuestorError ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao buscar dados no Questor." }, { status });
  }
}
