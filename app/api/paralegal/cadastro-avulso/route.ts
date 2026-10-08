import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { criarCadastroAvulso, QuestorError, type DadosCadastroAvulso } from "@/lib/questor";
import { gravacaoLiberada } from "@/lib/mei/api";

// Cadastro Avulso — cliente só no financeiro do Questor (sem empresa).
// Migrado do formCadastroAvulso do Access. Depende da rota
// POST /cadastro/pessoa-financeiro da API Questor (ver especificação).
export const dynamic = "force-dynamic";

const OBRIGATORIOS: (keyof DadosCadastroAvulso)[] = [
  "tipoinscr", "nome", "inscrfederal", "cep", "codigotipolograd", "endereco", "numero",
  "bairro", "siglaestado", "codigomunic", "dddfone", "numerofone", "email",
];

export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  let d: DadosCadastroAvulso & { mei?: boolean };
  try {
    d = await req.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const liberado = d?.mei ? podeAcessarApp(nivel, "mei", "Sistema MEI") : podeAcessarApp(nivel, "paralegal", "Controle");
  if (!liberado) {
    return NextResponse.json({ error: d?.mei ? "Sistema MEI restrito à T.I." : "Sem acesso ao Paralegal." }, { status: 403 });
  }
  // Trava do Sistema MEI (MEI_GRAVACAO_LIBERADA != "sim" => só simula).
  const simulacaoMei = !!d.mei && !gravacaoLiberada();

  const faltando = OBRIGATORIOS.filter((k) => d[k] === undefined || d[k] === null || String(d[k]).trim() === "");
  if (faltando.length) {
    return NextResponse.json({ erro: `Campos obrigatórios faltando: ${faltando.join(", ")}` }, { status: 400 });
  }

  try {
    const { ok, status, corpo } = await criarCadastroAvulso(d, { dryRun: simulacaoMei });
    if (status === 404 || status === 405) {
      return NextResponse.json(
        { erro: "A API do Questor ainda não tem a rota de cadastro avulso (POST /cadastro/pessoa-financeiro). Ela precisa ser criada pelo responsável da API — ver especificação." },
        { status: 501 }
      );
    }
    if (!ok) {
      const det = (corpo as { detail?: unknown }).detail;
      const msg = typeof det === "string" ? det : Array.isArray(det) ? det.map((x: { msg?: string; loc?: string[] }) => `${(x.loc ?? []).slice(-1)[0] ?? ""}: ${x.msg ?? ""}`).join("; ") : "A API do Questor recusou o cadastro.";
      return NextResponse.json({ erro: msg }, { status: status || 502 });
    }
    const chave = (corpo as { chave?: { codigocliente?: number } }).chave;
    return NextResponse.json({ ...corpo, codigocliente: chave?.codigocliente, simulacao_mei: simulacaoMei }, { status: 200 });
  } catch (e) {
    const status = e instanceof QuestorError ? e.status : 502;
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Falha ao cadastrar no Questor." }, { status });
  }
}
