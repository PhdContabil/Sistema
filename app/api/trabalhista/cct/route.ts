import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { listar, salvarSindicato, excluirSindicato, salvarPesquisa, registrarResultado, excluirPesquisa } from "@/lib/trabalhista/cct";

// Trabalhista › Convenções Coletivas: sindicatos e pesquisas programadas no Mediador.
export const dynamic = "force-dynamic";

async function usuario(): Promise<string | null> {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return null;
  const nivel = await obterNivelAcesso(email).catch(() => null);
  return nivel && podeAcessarApp(nivel, "trabalhista", "Convenções Coletivas") ? email : null;
}

export async function GET() {
  if (!(await usuario())) return NextResponse.json({ error: "Sem acesso ao módulo Trabalhista." }, { status: 403 });
  try { return NextResponse.json(await listar()); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status: 500 }); }
}

export async function POST(req: Request) {
  const email = await usuario();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Trabalhista." }, { status: 403 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }
  try {
    switch (b.acao) {
      case "sindicato": return NextResponse.json({ ok: true, sindicato: await salvarSindicato(b.dados ?? {}, email) });
      case "excluir_sindicato": await excluirSindicato(Number(b.id)); return NextResponse.json({ ok: true });
      case "pesquisa": return NextResponse.json({ ok: true, pesquisa: await salvarPesquisa(b.dados ?? {}, email) });
      case "resultado": await registrarResultado(Number(b.id), b.resultado, String(b.obs ?? ""), email); return NextResponse.json({ ok: true });
      case "excluir_pesquisa": await excluirPesquisa(Number(b.id)); return NextResponse.json({ ok: true });
      default: return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status: 422 });
  }
}
