import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { marcarGerado } from "@/lib/dissidio";
import { getPerfilEmpresas } from "@/lib/questor";
import { lerBoletosGerados } from "@/lib/boletos-sharepoint";
import { casarBoletos } from "@/lib/dissidio-boletos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function anoValido(v: string | null): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 2020 && n <= 2100 ? n : null;
}

/**
 * Sincroniza a coluna G (boleto/NF gerados) a partir da planilha de controle
 * do financeiro no SharePoint.
 *
 * O casamento é pelo código financeiro (`codigocliente`), não pelo nome —
 * então, ao contrário do sync de grupos econômicos, não há "prováveis": ou
 * o código bate com uma única empresa, ou fica de fora (sem empresa /
 * ambíguo) para alguém olhar na mão. GET traz a prévia; POST grava.
 */
async function montarPrevia(ano: number) {
  const [sp, perfil] = await Promise.all([
    lerBoletosGerados(),
    getPerfilEmpresas({ anos: [Math.min(ano, new Date().getFullYear())] }),
  ]);

  const empresas = (perfil.dados ?? []).map((e) => ({
    codigoempresa: e.codigoempresa,
    codigocliente: e.codigocliente ?? null,
    nome: e.nome,
  }));
  const baseMap = new Map(
    (perfil.dados ?? []).map((e) => [e.codigoempresa, e.mensalidade?.total ?? null])
  );

  const r = casarBoletos(sp.linhas, empresas);
  return { ...r, abasComErro: sp.abasComErro, totalLinhas: sp.linhas.length, baseMap };
}

export async function GET(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const ano = anoValido(searchParams.get("ano"));
  if (!ano) return NextResponse.json({ error: "Ano inválido." }, { status: 400 });

  try {
    const { gerados, semEmpresa, ambiguos, abasComErro, totalLinhas } = await montarPrevia(ano);
    return NextResponse.json({ gerados, semEmpresa, ambiguos, abasComErro, totalLinhas });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao ler a planilha de boletos." },
      { status: 502 }
    );
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: { ano?: number | string };
  try { body = await req.json(); } catch { body = {}; }
  const ano = anoValido(body.ano != null ? String(body.ano) : null);
  if (!ano) return NextResponse.json({ error: "Ano inválido." }, { status: 400 });

  try {
    const previa = await montarPrevia(ano);
    const itens = previa.gerados.map((c) => ({
      codigoempresa: c.codigoempresa,
      valor_base: previa.baseMap.get(c.codigoempresa) ?? null,
    }));

    const r = await marcarGerado(ano, itens, email);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 500 });

    return NextResponse.json({
      ok: true,
      marcados: r.marcados,
      jaEstava: r.jaEstava,
      encontrados: previa.gerados.length,
      semEmpresa: previa.semEmpresa.length,
      ambiguos: previa.ambiguos.length,
      abasComErro: previa.abasComErro,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao sincronizar." },
      { status: 502 }
    );
  }
}
