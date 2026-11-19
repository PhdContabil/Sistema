// Fiscal · Parcelamentos do Simples Nacional (Integra Contador).
//   GET                                           -> controle (banco) + carteira Questor (grátis)
//   POST { acao: "pedidos", cnpj }                -> consulta as 4 modalidades e sincroniza (4 chamadas PAGAS)
//   POST { acao: "detalhe", cnpj, modalidade, numero } -> parcelamento + parcelas a gerar (2 PAGAS)
//   POST { acao: "parcelas", cnpj, modalidade }   -> parcelas a gerar (1 PAGA)
//   POST { acao: "gerar_das", cnpj, modalidade, parcela } -> PDF do DAS (1 PAGA)
//   POST { acao: "remover", id }                  -> tira do controle (grátis)
import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { exigirFiscal } from "../dare-sp/_auth";
import { consultarPedidos, detalhe, gerarDas, listarControle, parcelas, remover } from "@/lib/parcelamentos";
import { ehModalidade } from "@/lib/parcelamentos-regras";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SEM_ACESSO = { error: "Sem acesso ao módulo Fiscal." };

export async function GET() {
  noStore();
  if (!(await exigirFiscal())) return NextResponse.json(SEM_ACESSO, { status: 403 });
  try {
    return NextResponse.json(await listarControle());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao listar." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const email = await exigirFiscal();
  if (!email) return NextResponse.json(SEM_ACESSO, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    const cnpj = String(b.cnpj ?? "");
    if (["detalhe", "parcelas", "gerar_das"].includes(b.acao) && !ehModalidade(b.modalidade)) {
      return NextResponse.json({ error: "Modalidade inválida." }, { status: 400 });
    }
    switch (b.acao) {
      case "pedidos": return NextResponse.json(await consultarPedidos(cnpj, b.razao_social ?? null, email));
      case "detalhe": return NextResponse.json(await detalhe(cnpj, b.modalidade, Number(b.numero), email));
      case "parcelas": return NextResponse.json({ parcelas: await parcelas(cnpj, b.modalidade) });
      case "gerar_das": {
        const r = await gerarDas(cnpj, b.modalidade, Number(b.parcela), email);
        return r.ok ? NextResponse.json({ pdf: r.pdf }) : NextResponse.json({ error: r.mensagem }, { status: 422 });
      }
      case "remover": await remover(Number(b.id)); return NextResponse.json({ ok: true });
      default: return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha na operação." }, { status: 500 });
  }
}
