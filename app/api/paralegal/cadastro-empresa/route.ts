import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { criarCadastroEmpresa, QuestorError, type DadosCadastroEmpresa } from "@/lib/questor";

// Criação (com pré-visualização via dry_run) de empresa nova no Questor —
// migrado de /api/cadastro-empresa do Paralegal System (index.html antigo).
//
// IMPORTANTE: isto ESCREVE dados novos no Questor (diferente do resto do
// Paralegal, que só lê). A QUESTOR_API_KEY hoje está documentada no projeto
// como "somente-leitura" — pode ser que a API recuse a escrita com a chave
// atual, ou que o endpoint real seja outro. Ver lib/questor.ts
// (criarCadastroEmpresa) para ajustar o caminho se necessário.
export const dynamic = "force-dynamic";

interface CorpoRequisicao {
  dados: DadosCadastroEmpresa;
  dry_run: boolean;
  confirmar: boolean;
}

export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  if (!podeAcessarApp(nivel, "paralegal", "Controle")) {
    return NextResponse.json({ error: "Sem acesso ao Paralegal." }, { status: 403 });
  }

  let body: CorpoRequisicao;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  if (!body?.dados) {
    return NextResponse.json({ error: "Campo obrigatório: dados." }, { status: 400 });
  }

  // Mesma validação essencial do formulário antigo, replicada no servidor
  // (o front já valida, mas a API não deve confiar só nisso).
  const faltando: string[] = [];
  const d = body.dados;
  if (!d.codigoempresa) faltando.push("codigoempresa");
  if (!d.nomeempresa) faltando.push("nomeempresa");
  if (!d.inscrfederal) faltando.push("inscrfederal");
  if (!d.codigonaturjurid) faltando.push("codigonaturjurid");
  if (!d.tipoenquad) faltando.push("tipoenquad");
  if (!d.codigotabferiado) faltando.push("codigotabferiado");
  if (!d.datainicioativ) faltando.push("datainicioativ");
  if (!d.codigoativfederal) faltando.push("codigoativfederal");
  if (!d.codigotipolograd) faltando.push("codigotipolograd");
  if (!d.enderecoestab) faltando.push("enderecoestab");
  if (!d.numenderestab) faltando.push("numenderestab");
  if (!d.siglaestado) faltando.push("siglaestado");
  if (!d.codigomunic) faltando.push("codigomunic");
  if (!Array.isArray(d.socios) || d.socios.length === 0) faltando.push("socios");

  if (faltando.length) {
    return NextResponse.json({ erro: `Campos obrigatórios faltando: ${faltando.join(",")}` }, { status: 400 });
  }

  try {
    const { ok, status, corpo } = await criarCadastroEmpresa(d, {
      dryRun: Boolean(body.dry_run),
      confirmar: Boolean(body.confirmar),
    });
    return NextResponse.json(corpo, { status: ok ? 200 : status || 502 });
  } catch (e) {
    const status = e instanceof QuestorError ? e.status : 502;
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Falha ao criar a empresa no Questor." }, { status });
  }
}
