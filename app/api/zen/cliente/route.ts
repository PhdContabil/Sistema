import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { getEstabelecimentos, QuestorError } from "@/lib/questor";
import { cadastrarCliente, consultarCliente, ClienteNaoEncontradoError, hasQuestorZenToken, QuestorZenError } from "@/lib/questor-zen";

// Sincroniza uma empresa recém-criada no Questor com o Questor Zen (CRM > Clientes).
// Mesmo cadastro que o Access fazia em formCadastroQuestor > CadastrarEmpresaQuestorZen:
// POST /clientes com os dados do estabelecimento e SincTareffa = true.
// POST { codigoempresa, codigoestab? }   — dados lidos do próprio Questor, não do navegador.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const s = (v: unknown) => (v === null || v === undefined || v === "None" ? "" : String(v).trim());

export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  if (!podeAcessarApp(nivel, "paralegal", "Controle") && !podeAcessarApp(nivel, "mei", "Sistema MEI")) {
    return NextResponse.json({ error: "Sem acesso ao Paralegal ou ao Sistema MEI." }, { status: 403 });
  }
  if (!hasQuestorZenToken()) return NextResponse.json({ error: "Chave do Questor Zen não configurada." }, { status: 412 });

  let b: { codigoempresa?: number; codigoestab?: number };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const cod = Number(b.codigoempresa);
  const estab = Number(b.codigoestab ?? 1);
  if (!cod) return NextResponse.json({ error: "Informe o código da empresa." }, { status: 400 });

  try {
    const estabs = await getEstabelecimentos(cod);
    const e = estabs.find((x) => Number(x.codigoestab) === estab) ?? estabs[0];
    if (!e) return NextResponse.json({ error: "Empresa não encontrada no Questor." }, { status: 404 });
    const r = e as unknown as Record<string, unknown>;
    const doc = s(r.inscrfederal).replace(/\D/g, "");

    // Já existe no Zen? Então não duplica.
    try {
      const ja = await consultarCliente(doc);
      return NextResponse.json({ ok: true, jaExistia: true, cliente: ja });
    } catch (err) {
      if (!(err instanceof ClienteNaoEncontradoError)) throw err;
    }

    const corpo = {
      CodigoCliente: String(cod),
      Nome: s(r.nomeestabcompleto) || s(r.nomeempresa),
      InscricaoFederal: doc,
      InscricaoMunicipal: s(r.inscrmunic),
      InscricaoEstadual: s(r.inscrestad),
      Telefone: s(r.telefone),
      Email: s(r.email),
      Logadouro: [s(r.tipologradouro), s(r.enderecoestab)].filter(Boolean).join(" "),
      Numero: Number(s(r.numenderestab).replace(/\D/g, "")) || 0,
      Complemento: s(r.complenderestab),
      Bairro: s(r.bairroenderestab),
      Cidade: s(r.nomemunic),
      Cep: s(r.cependerestab).replace(/\D/g, ""),
      Estado: s(r.siglaestado),
      Organizacao: "",
      WebSite: "",
      Desativado: false,
      CompanyId: String(cod),
      SubsidiaryId: String(Number(r.codigoestab) || estab),
      DataDesativacao: "",
      SincTareffa: true,
      LogPadronizado: true,
    };
    const resposta = await cadastrarCliente(corpo);
    return NextResponse.json({ ok: true, jaExistia: false, resposta });
  } catch (err) {
    const status = err instanceof QuestorZenError || err instanceof QuestorError ? (err as { status?: number }).status ?? 502 : 502;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Falha ao sincronizar com o Questor Zen." }, { status });
  }
}
