// Tecnologia · Integra Contador — certificado A1 e credenciais SERPRO.
// Só T.I./Diretoria (mesma regra dos apps restritos de Tecnologia).
//   GET                         -> metadados (nunca os segredos)
//   GET ?testar=1               -> autentica no SERPRO com o que está gravado
//   POST { consumerKey?, consumerSecret?, pfxBase64?, pfxSenha?, contratanteCnpj? }
import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarAppTecnologia } from "@/lib/acesso";
import { obterMetadados, salvarConfiguracao, testarConexao } from "@/lib/serpro/configuracao";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function exigirTI(): Promise<string | null> {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return null;
  const nivel = await obterNivelAcesso(email).catch(() => null);
  return nivel && podeAcessarAppTecnologia(nivel, "/m/tecnologia/integra-contador") ? email : null;
}

export async function GET(req: Request) {
  noStore();
  if (!(await exigirTI())) return NextResponse.json({ error: "Acesso restrito a T.I. e Diretoria." }, { status: 403 });
  try {
    if (new URL(req.url).searchParams.get("testar")) return NextResponse.json(await testarConexao());
    return NextResponse.json(await obterMetadados());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ler." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const email = await exigirTI();
  if (!email) return NextResponse.json({ error: "Acesso restrito a T.I. e Diretoria." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    const r = await salvarConfiguracao(b, email);
    return NextResponse.json({ ...r, metadados: await obterMetadados() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao salvar." }, { status: 400 });
  }
}
