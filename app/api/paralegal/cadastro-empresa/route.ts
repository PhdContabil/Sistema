import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { criarCadastroEmpresa, QuestorError, type DadosCadastroEmpresa } from "@/lib/questor";
import { gravacaoLiberada } from "@/lib/mei/api";

// Criação (com pré-visualização via dry_run) de empresa nova no Questor —
// migrado de /api/cadastro-empresa do Paralegal System (index.html antigo).
//
// IMPORTANTE: isto ESCREVE dados novos no Questor (diferente do resto do
// Paralegal, que só lê). Usa QUESTOR_WRITE_KEY (header X-Write-Key),
// separada da QUESTOR_API_KEY de leitura — ver lib/questor.ts.
export const dynamic = "force-dynamic";

interface CorpoRequisicao {
  dados: DadosCadastroEmpresa;
  dry_run: boolean;
  confirmar: boolean;
  idempotency_key?: string;
  mei?: boolean; // tela "Cliente Mensal" do Sistema MEI
}

export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  let body: CorpoRequisicao;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const liberado = body?.mei ? podeAcessarApp(nivel, "mei", "Sistema MEI") : podeAcessarApp(nivel, "paralegal", "Controle");
  if (!liberado) {
    return NextResponse.json({ error: body?.mei ? "Sistema MEI restrito à T.I." : "Sem acesso ao Paralegal." }, { status: 403 });
  }
  // Trava do Sistema MEI: enquanto MEI_GRAVACAO_LIBERADA != "sim", o "Confirmar" vira simulação.
  const simulacaoMei = !!body.mei && !gravacaoLiberada() && !body.dry_run;
  if (simulacaoMei) { body.dry_run = true; body.confirmar = false; }

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
      idempotencyKey: typeof body.idempotency_key === "string" ? body.idempotency_key : undefined,
    });
    return NextResponse.json(simulacaoMei ? { ...corpo, simulacao_mei: true } : corpo, { status: ok ? 200 : status || 502 });
  } catch (e) {
    const status = e instanceof QuestorError ? e.status : 502;
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Falha ao criar a empresa no Questor." }, { status });
  }
}
