// Recálculos — SERVIDOR. Guia atualizada para uma data de pagamento via
// Integra Contador (chamada PAGA, só por clique). Sem histórico: a guia é
// devolvida direto para a tela; fica só a linha de auditoria no log.
//
//   debitosEmAberto() -> débitos exigíveis lidos da Situação Fiscal (grátis)
//   gerarGuia()       -> DAS / DAS-MEI / DCTFWeb / DARF SICALC

import { getEmpresas, hasApiKey } from "./questor";
import { autenticar, consumir, dadosDe, participante, textoMensagens } from "./serpro/integra-contador";
import { carregarCredenciais, db, registrarChamada, soDigitos } from "./serpro/servidor";
import { montarPedido, pdfDoRetorno, type Debito, type PedidoRecalculo, type Servico } from "./recalculo-regras";

export interface EmpresaComDebitos {
  cnpj: string;
  razao_social: string | null;
  consultado_em: string | null;
  debitos: Debito[];
}

/** Empresas com débito exigível na última Situação Fiscal consultada. */
/** Data da última Situação Fiscal de cada empresa (cnpj -> ISO). */
export async function ultimasConsultas(): Promise<Record<string, string>> {
  const { data, error } = await db().from("situacao_fiscal").select("cnpj, consultado_em").not("consultado_em", "is", null);
  if (error) throw new Error(error.message);
  return Object.fromEntries(((data ?? []) as { cnpj: string; consultado_em: string }[]).map((r) => [r.cnpj, r.consultado_em]));
}

export async function debitosEmAberto(): Promise<{ empresas: EmpresaComDebitos[]; semLeitura: number }> {
  const { data, error } = await db().from("situacao_fiscal")
    .select("cnpj, razao_social, consultado_em, debitos").not("debitos", "is", null);
  if (error) throw new Error(error.message);
  const linhas = (data ?? []) as unknown as EmpresaComDebitos[];

  const nomes = new Map<string, string>();
  if (hasApiKey()) {
    try {
      const { dados } = await getEmpresas(true);
      for (const e of dados) if (e.nome) nomes.set(soDigitos(e.cnpj), e.nome);
    } catch { /* sem Questor: usa o nome gravado */ }
  }

  const empresas = linhas
    .filter((l) => Array.isArray(l.debitos) && l.debitos.length)
    .map((l) => ({ ...l, razao_social: nomes.get(l.cnpj) ?? l.razao_social }))
    .sort((a, b) => (a.razao_social ?? "").localeCompare(b.razao_social ?? "", "pt-BR"));

  const { count } = await db().from("situacao_fiscal").select("cnpj", { count: "exact", head: true })
    .not("pdf_base64", "is", null).is("debitos", null);
  return { empresas, semLeitura: count ?? 0 };
}

const MOTIVOS: [RegExp, string][] = [
  [/n[aã]o autorizad|procura[cç][aã]o/i, "Sem procuração/autorização do escritório para esta empresa."],
  [/n[aã]o (foi|existe|h[aá]).{0,40}declara/i, "Não há declaração transmitida para esse período."],
  [/dia [uú]til|data.{0,30}acolhimento/i, "Data de pagamento não aceita (precisa ser dia útil, a partir de hoje e, na DCTFWeb, no mês corrente)."],
  [/pago|quitad|liquidad/i, "A Receita indica que o débito já está pago."],
];

/** Gera a guia atualizada. Devolve o PDF em base64 ou a mensagem da Receita. */
export async function gerarGuia(cnpjRaw: string, pedido: PedidoRecalculo, por: string) {
  const cnpj = soDigitos(cnpjRaw);
  if (cnpj.length !== 14 && cnpj.length !== 11) throw new Error("CNPJ inválido.");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD
  const p = montarPedido(pedido, hoje);

  const cred = await carregarCredenciais();
  const tokens = await autenticar(cred);
  const r = await consumir({
    tokens, metodo: "Emitir", contratante: participante(cred.contratante_cnpj), contribuinte: participante(cnpj),
    pedidoDados: { idSistema: p.idSistema, idServico: p.idServico, versaoSistema: p.versaoSistema, dados: JSON.stringify(p.dados) },
  });
  const pdf = pdfDoRetorno(pedido.servico as Servico, dadosDe(r));
  const textos = textoMensagens(r);

  await registrarChamada("serpro-recalculo", `Recálculo ${p.idServico}`, cnpj, !!pdf, {
    servico: pedido.servico, periodo: pedido.periodo, data_pagamento: pedido.dataPagamento,
    codigo: pedido.codigo ?? null, http: r.httpStatus, mensagens: textos.slice(0, 500), por,
  });

  if (pdf) {
    const nome = `Guia_${pedido.servico.toUpperCase()}_${cnpj}_${pedido.periodo.replace(/\W+/g, "-")}_pgto-${pedido.dataPagamento}.pdf`;
    return { ok: true as const, pdf, nome };
  }
  const motivo = MOTIVOS.find(([re]) => re.test(textos))?.[1];
  return { ok: false as const, mensagem: motivo ? `${motivo} (${textos || `HTTP ${r.httpStatus}`})` : (textos || `A Receita não devolveu a guia (HTTP ${r.httpStatus}).`) };
}
