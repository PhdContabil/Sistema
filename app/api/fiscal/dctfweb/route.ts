// Fiscal · DCTFWeb
//   GET  ?competencia=AAAA-MM                    -> competências salvas + declarações da competência (só banco)
//   POST { acao: "sincronizar", competencia }    -> traz as obrigadas do Questor (sem custo)
//   POST { acao: "consultar", id }               -> situação na Receita (SERPRO, cobrado)
//   POST { acao: "transmitir", id }              -> assina e transmite UMA declaração (irreversível)
//   POST { acao: "trava", id, valor }            -> liga/desliga "não transmitir"
import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { exigirDctfweb } from "../dare-sp/_auth";
import {
  competenciasSalvas, consultar, definirTrava, listar, obterParametros, sincronizarObrigadas, transmitir,
} from "@/lib/dctfweb";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const falha = (e: unknown, padrao: string, status = 500) =>
  NextResponse.json({ error: e instanceof Error ? e.message : padrao }, { status });

export async function GET(req: Request) {
  noStore();
  if (!(await exigirDctfweb())) return NextResponse.json({ error: "Sem acesso à DCTFWeb (Fiscal ou Trabalhista)." }, { status: 403 });
  try {
    const competencias = await competenciasSalvas();
    const pedida = new URL(req.url).searchParams.get("competencia");
    const competencia = pedida || competencias[0] || null;
    return NextResponse.json({ competencias, competencia, linhas: competencia ? await listar(competencia) : [] });
  } catch (e) {
    return falha(e, "Falha ao listar.");
  }
}

export async function POST(req: Request) {
  const email = await exigirDctfweb();
  if (!email) return NextResponse.json({ error: "Sem acesso à DCTFWeb (Fiscal ou Trabalhista)." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { acao?: string; id?: number; competencia?: string; valor?: boolean };
  try {
    switch (b.acao) {
      case "sincronizar":
        return NextResponse.json({ ok: true, ...(await sincronizarObrigadas(b.competencia ?? "")) });
      case "consultar":
        if (!b.id) return falha(null, "Informe a declaração.", 400);
        return NextResponse.json(await consultar(Number(b.id)));
      case "transmitir": {
        if (!b.id) return falha(null, "Informe a declaração.", 400);
        const p = await obterParametros();
        return NextResponse.json(await transmitir(Number(b.id), { consultarAntes: p.consultar_antes, por: email }));
      }
      case "trava":
        if (!b.id) return falha(null, "Informe a declaração.", 400);
        return NextResponse.json(await definirTrava(Number(b.id), !!b.valor));
      default:
        return falha(null, "Ação inválida.", 400);
    }
  } catch (e) {
    return falha(e, "Falha na operação.");
  }
}
