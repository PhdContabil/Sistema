// Recálculos (Fiscal + Trabalhista). Guia atualizada via Integra Contador.
//   GET                       -> débitos em aberto (Situação Fiscal) + carteira do Questor (grátis)
//   POST { cnpj, pedido }     -> gera a guia (PAGO) e devolve o PDF; erro em JSON
//   POST { acao: "atualizar_sf", cnpj } -> nova Situação Fiscal da empresa (PAGO)
import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { exigirRecalculos } from "../dare-sp/_auth";
import { debitosEmAberto, gerarGuia, ultimasConsultas } from "@/lib/recalculo";
import { consultarEmpresa } from "@/lib/situacao-fiscal";
import { getEmpresas, hasApiKey } from "@/lib/questor";
import { soDigitos } from "@/lib/serpro/servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SEM_ACESSO = { error: "Sem acesso a Recálculos (Fiscal ou Trabalhista)." };

export async function GET() {
  noStore();
  if (!(await exigirRecalculos())) return NextResponse.json(SEM_ACESSO, { status: 403 });
  try {
    const [{ empresas, semLeitura }, consultas] = await Promise.all([debitosEmAberto(), ultimasConsultas()]);
    let carteira: { cnpj: string; nome: string | null; codigo: number }[] = [];
    let avisoCarteira: string | null = null;
    if (hasApiKey()) {
      try {
        const { dados } = await getEmpresas(true);
        carteira = dados.map((e) => ({ cnpj: soDigitos(e.cnpj), nome: e.nome, codigo: e.codigoempresa }))
          .filter((e) => e.cnpj.length === 14 || e.cnpj.length === 11)
          .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"));
      } catch (e) {
        avisoCarteira = `Não consegui ler a carteira do Questor (${e instanceof Error ? e.message : "erro"}). Digite o CNPJ.`;
      }
    } else {
      avisoCarteira = "API Questor não configurada: digite o CNPJ.";
    }
    return NextResponse.json({ empresas, semLeitura, carteira, avisoCarteira, consultas });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao listar." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const email = await exigirRecalculos();
  if (!email) return NextResponse.json(SEM_ACESSO, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (b.acao === "atualizar_sf") {
    // Nova Situação Fiscal desta empresa (PAGA). Regrava débitos e data da consulta.
    try {
      if (!b.cnpj) return NextResponse.json({ error: "Informe o CNPJ." }, { status: 400 });
      return NextResponse.json(await consultarEmpresa(String(b.cnpj), b.razao_social ?? null, email));
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao consultar." }, { status: 500 });
    }
  }
  try {
    const r = await gerarGuia(String(b.cnpj ?? ""), b.pedido ?? {}, email);
    if (!r.ok) return NextResponse.json({ error: r.mensagem }, { status: 422 });
    return new NextResponse(Buffer.from(r.pdf, "base64"), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${r.nome}"` },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao gerar." }, { status: 400 });
  }
}
