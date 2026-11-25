import { NextResponse } from "next/server";
import { exigirFiscal } from "../_auth";
import {
  listarCadastro, salvarCadastro, removerCadastro, salvarTomador, removerTomador, marcarTomadorPadrao, type DadosCadastro,
} from "@/lib/fiscal/nfse-cadastro";

export const dynamic = "force-dynamic";

/** Empresas cadastradas para emissão, com os tomadores de cada uma. */
export async function GET() {
  if (!(await exigirFiscal())) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  try {
    return NextResponse.json({ empresas: await listarCadastro() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status: 502 });
  }
}

/**
 * POST { acao, ... }: salvar (empresa) · remover {codigoempresa} ·
 * tomador {codigoempresa, doc, nome, padrao} · tomador_remover {id} · tomador_padrao {id}
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
      default: return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, empresas: await listarCadastro() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha." }, { status: 422 });
  }
}
