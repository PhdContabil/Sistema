import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { db } from "@/lib/dissidio";
import { getPerfilEmpresas } from "@/lib/questor";
import { listarEmpresas } from "@/lib/empresas-sharepoint";
import { casarGrupos, nomeGrupo, type PastaGrupo } from "@/lib/dissidio-grupos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sincroniza o grupo econômico das empresas a partir das pastas do SharePoint.
 *
 * O grupo não existe no Questor — está na estrutura de pastas de /sites/Empresas,
 * onde uma pasta "GRUPO X" contém as pastas das empresas do grupo. Aqui casamos
 * NOME DE PASTA com NOME DE EMPRESA, o que é aproximado.
 *
 * Por isso são dois passos: GET devolve a prévia para conferência e POST grava.
 * Nada é escrito sem alguém olhar antes — casar errado significaria reajustar
 * uma empresa como parte de um grupo do qual ela não faz parte.
 */
async function montarPrevia() {
  const [sp, perfil] = await Promise.all([
    listarEmpresas(),
    getPerfilEmpresas({ anos: [new Date().getFullYear()] }),
  ]);

  // Só interessam as pastas que estavam dentro de uma pasta de grupo.
  const pastas: PastaGrupo[] = sp.empresas
    .filter((e) => e.grupo)
    .map((e) => ({ nome: e.name, grupo: nomeGrupo(e.grupo!.name) }));

  const empresas = (perfil.dados ?? []).map((e) => ({
    codigoempresa: e.codigoempresa,
    nome: e.nome,
  }));

  const r = casarGrupos(pastas, empresas);
  return { ...r, totalPastas: pastas.length, totalEmpresas: empresas.length };
}

export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  if (!user?.email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    return NextResponse.json(await montarPrevia());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao montar a prévia." },
      { status: 502 }
    );
  }
}

/**
 * Grava os casamentos.
 *
 * Por padrão entram os seguros — casados por CÓDIGO da pasta e por nome
 * idêntico. Os "prováveis" (casados por prefixo do nome) só entram se pedido,
 * porque são o único caso em que um erro de casamento é plausível.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const email = user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: { incluirProvaveis?: boolean; limparAntes?: boolean };
  try { body = await req.json(); } catch { body = {}; }

  const sb = db();
  if (!sb) return NextResponse.json({ error: "Banco indisponível." }, { status: 500 });

  try {
    const previa = await montarPrevia();
    const aplicar = previa.casados.filter(
      (c) =>
        c.confianca === "codigo" ||
        c.confianca === "exata" ||
        (body.incluirProvaveis && c.confianca === "provavel")
    );

    if (body.limparAntes) {
      await sb.from("dissidio_empresas").update({ grupo: null }).not("grupo", "is", null);
    }

    const agora = new Date().toISOString();
    const lote = aplicar.map((c) => ({
      codigoempresa: c.codigoempresa,
      grupo: c.grupo,
      atualizado_por: email,
      atualizado_em: agora,
    }));

    for (let i = 0; i < lote.length; i += 500) {
      const { error } = await sb
        .from("dissidio_empresas")
        .upsert(lote.slice(i, i + 500), { onConflict: "codigoempresa" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      gravados: lote.length,
      porCodigo: previa.casados.filter((c) => c.confianca === "codigo").length,
      exatos: previa.casados.filter((c) => c.confianca === "exata").length,
      provaveis: previa.casados.filter((c) => c.confianca === "provavel").length,
      ambiguas: previa.ambiguas.length,
      semEmpresa: previa.pastasSemEmpresa.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao sincronizar." },
      { status: 502 }
    );
  }
}
