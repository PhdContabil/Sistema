import { NextResponse } from "next/server";
import { exigirFiscal } from "../_auth";
import {
  listarCadastro, salvarCadastro, removerCadastro, salvarTomador, removerTomador, marcarTomadorPadrao, type DadosCadastro,
  textosTomador, listarGrupos, criarGrupo, renomearGrupo, removerGrupo,
} from "@/lib/fiscal/nfse-cadastro";

export const dynamic = "force-dynamic";

/** Empresas cadastradas para emissão, com os tomadores de cada uma. */
export async function GET() {
  if (!(await exigirFiscal())) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  try {
    const [empresas, grupos] = await Promise.all([listarCadastro(), listarGrupos()]);
    return NextResponse.json({ empresas, grupos });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status: 502 });
  }
}

/**
 * POST { acao, ... }: salvar (empresa) · remover {codigoempresa} ·
 * tomador {codigoempresa, doc, nome, padrao, sem_tomador, descricao, info_compl} · tomador_remover {id} · tomador_padrao {id}
 * tomador_textos {id, descricao, info_compl} · grupo_criar {nome} · grupo_renomear {id, nome} · grupo_remover {id}
 */
export async function POST(req: Request) {
  const email = await exigirFiscal();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown> & { acao?: string };
  try {
    switch (b.acao) {
      case "salvar": await salvarCadastro(b as unknown as DadosCadastro, email); break;
      case "remover": await removerCadastro(Number(b.codigoempresa)); break;
      case "tomador": await salvarTomador(b as never, email); break;
      case "tomador_remover": await removerTomador(Number(b.id)); break;
      case "tomador_padrao": await marcarTomadorPadrao(Number(b.id)); break;
      case "tomador_textos": await textosTomador(Number(b.id), (b.descricao as string) ?? null, (b.info_compl as string) ?? null); break;
      case "grupo_criar": { const g = await criarGrupo(String(b.nome ?? ""), email); const [empresas, grupos] = await Promise.all([listarCadastro(), listarGrupos()]); return NextResponse.json({ ok: true, grupo: g, empresas, grupos }); }
      case "grupo_renomear": await renomearGrupo(Number(b.id), String(b.nome ?? "")); break;
      case "grupo_remover": await removerGrupo(Number(b.id)); break;
      default: return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
    const [empresas, grupos] = await Promise.all([listarCadastro(), listarGrupos()]);
    return NextResponse.json({ ok: true, empresas, grupos });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status: 422 });
  }
}
