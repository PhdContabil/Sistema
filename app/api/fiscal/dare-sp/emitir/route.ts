import { NextResponse } from "next/server";
import {
  obterDebito, obterContribuinte, salvarContribuinte, gravarGuia, marcarEnvioZen,
} from "@/lib/dare-sp";
import { montarGuia, receitaSugerida, type Regime } from "@/lib/dare-sp-calculo";
import { obterSelic, SelicError } from "@/lib/selic";
import {
  acharReceita, emitirGuia, temChaveSefaz, totalConfere, SefazError,
} from "@/lib/dare-sp-sefaz";
import { linhaFormatada } from "@/lib/dare-sp-linha";
import { enviarGuiaAoZen, temTokenZen } from "@/lib/dare-sp-zen";
import { exigirFiscal } from "../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Corpo {
  codigoempresa?: number;
  codigoestab?: number;
  competencia?: string;
  codigoimposto?: string;
  pagamento?: string;
  regime?: Regime;
  /** Sobrepõe a receita sugerida, quando o usuário troca na tela. */
  codigoServico?: number;
  /** Endereço, quando é a primeira guia da empresa. */
  endereco?: { endereco: string; cidade: string; uf?: string; telefone?: string };
  /** true = emitir e já subir para o Edoc do Zen. */
  enviarZen?: boolean;
}

/**
 * Emite a guia na Sefaz e grava o resultado. Com `enviarZen`, sobe o PDF para
 * o Edoc depois — nessa ordem, porque a guia emitida vale mesmo que o Zen
 * falhe, e nesse caso a tela mostra a guia com um aviso em vez de perder tudo.
 */
export async function POST(req: Request) {
  const email = await exigirFiscal();
  if (!email) return NextResponse.json({ error: "Sem acesso ao módulo Fiscal." }, { status: 403 });
  if (!temChaveSefaz()) {
    return NextResponse.json(
      { error: "Chave da Sefaz-SP não configurada (SEFAZ_SP_DARE_API_KEY)." },
      { status: 412 }
    );
  }

  let b: Corpo;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Dados inválidos." }, { status: 400 }); }

  if (!b.codigoempresa || !b.competencia || !b.codigoimposto || !b.pagamento) {
    return NextResponse.json({ error: "Débito ou data de pagamento não informados." }, { status: 400 });
  }

  const debito = await obterDebito(
    b.codigoempresa, b.codigoestab ?? 0, b.competencia, b.codigoimposto
  );
  if (!debito) return NextResponse.json({ error: "Débito não encontrado." }, { status: 404 });
  if (!debito.vencimento) {
    return NextResponse.json(
      { error: "Este débito está sem vencimento. Informe o vencimento antes de emitir." },
      { status: 422 }
    );
  }
  if (!debito.cnpj) {
    return NextResponse.json({ error: "Débito sem CNPJ — não dá para emitir." }, { status: 422 });
  }

  // ---- acréscimos
  let selic;
  try { selic = await obterSelic(); }
  catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao consultar a Selic." },
      { status: e instanceof SelicError ? e.status : 502 }
    );
  }

  const calculo = montarGuia(debito.valor, debito.vencimento, b.pagamento, selic);
  if (calculo.incompleta) {
    return NextResponse.json({ error: calculo.impedimento }, { status: 422 });
  }

  // ---- endereço: grava ANTES de emitir
  let contribuinte = await obterContribuinte(debito.cnpj);
  if (b.endereco?.endereco && b.endereco?.cidade) {
    const erro = await salvarContribuinte({
      cnpj: debito.cnpj,
      razao_social: debito.nome,
      endereco: b.endereco.endereco,
      cidade: b.endereco.cidade,
      uf: b.endereco.uf || "SP",
      telefone: b.endereco.telefone ?? null,
    }, email);
    if (erro) return NextResponse.json({ error: erro }, { status: 500 });
    contribuinte = await obterContribuinte(debito.cnpj);
  }
  if (!contribuinte) {
    return NextResponse.json(
      { error: "A Sefaz exige endereço e cidade do contribuinte. Informe para emitir.", faltaEndereco: true },
      { status: 422 }
    );
  }

  // ---- receita
  const sugerida = receitaSugerida(b.codigoimposto, b.regime ?? "simples");
  const servico = b.codigoServico ?? sugerida?.codigoServico;
  if (!servico) {
    return NextResponse.json(
      { error: `Sem receita conhecida para o código ${b.codigoimposto}. Escolha a receita na tela.` },
      { status: 422 }
    );
  }

  let receita;
  try {
    receita = await acharReceita(servico);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao ler o catálogo de receitas." },
      { status: e instanceof SefazError ? e.status : 502 }
    );
  }
  if (!receita) {
    return NextResponse.json(
      { error: `A receita ${servico} não está no catálogo da Sefaz.` },
      { status: 422 }
    );
  }

  // ---- emissão
  let emitida;
  try {
    emitida = await emitirGuia({
      dataVencimento: b.pagamento,
      receita,
      referencia: b.competencia,
      valor: calculo.principal,
      valorMulta: calculo.multa.valor,
      valorJuros: calculo.juros.valor,
      cnpj: debito.cnpj,
      razaoSocial: contribuinte.razao_social ?? debito.nome ?? "",
      endereco: contribuinte.endereco,
      cidade: contribuinte.cidade,
      uf: contribuinte.uf,
      telefone: contribuinte.telefone ?? undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao emitir na Sefaz." },
      { status: e instanceof SefazError ? e.status : 502 }
    );
  }

  const linha = emitida.codigoBarra44 ? linhaFormatada(emitida.codigoBarra44) : null;

  const { id, error } = await gravarGuia({
    codigoempresa: debito.codigoempresa,
    codigoestab: debito.codigoestab,
    competencia: debito.competencia,
    codigoimposto: debito.codigoimposto,
    cnpj: debito.cnpj,
    nome: debito.nome,
    principal: calculo.principal,
    multa: calculo.multa.valor,
    juros: calculo.juros.valor,
    total: calculo.total,
    vencimento: debito.vencimento,
    data_pagamento: b.pagamento,
    receita_codigo: receita.codigo,
    receita_servico: receita.codigoServicoDARE,
    numero_controle: emitida.numeroControle,
    codigo_barras: emitida.codigoBarra44,
    linha_digitavel: linha,
    pix: emitida.pixCopiaCola,
    pdf_base64: emitida.documentoImpressao,
    total_sefaz: emitida.valorTotal,
  }, email);
  if (error) return NextResponse.json({ error }, { status: 500 });

  const avisos: string[] = [];
  if (!totalConfere(emitida.valorTotal, calculo.total)) {
    // A Sefaz só soma o que mandamos; divergência aqui é sinal de que algo
    // saiu diferente do calculado, e precisa ser conferido antes de pagar.
    avisos.push(
      `A Sefaz devolveu R$ ${emitida.valorTotal.toFixed(2)} e o cálculo deu R$ ${calculo.total.toFixed(2)}. Confira antes de pagar.`
    );
  }

  // ---- Zen, quando pedido
  let zen: { documentoId: string } | null = null;
  if (b.enviarZen) {
    if (!temTokenZen()) {
      avisos.push("Guia emitida, mas o token do Questor Zen não está configurado — o envio ao Edoc não aconteceu.");
    } else {
      try {
        const r = await enviarGuiaAoZen({
          cnpj: debito.cnpj,
          referencia: debito.competencia,
          vencimento: b.pagamento,
          total: calculo.total,
          pdfBase64: emitida.documentoImpressao,
          nomeEmpresa: debito.nome,
        });
        zen = { documentoId: r.documentoId };
        if (id) await marcarEnvioZen(id, r.documentoId);
      } catch (e) {
        avisos.push(
          `Guia emitida, mas não subiu para o Zen: ${e instanceof Error ? e.message : "erro desconhecido"}`
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    id,
    calculo,
    receita: { codigo: receita.codigo, nome: receita.nome, servico: receita.codigoServicoDARE },
    guia: {
      numeroControle: emitida.numeroControle,
      linhaDigitavel: linha,
      pix: emitida.pixCopiaCola,
      totalSefaz: emitida.valorTotal,
    },
    zen,
    avisos,
  });
}
