// Parcelamentos do Simples Nacional — SERVIDOR. Toda consulta à Receita é paga
// e só acontece por clique. O controle (parcelamentos_sn) guarda quem está em parcelamento.

import { getEmpresas, hasApiKey } from "./questor";
import { autenticar, consumir, dadosDe, participante, textoMensagens, type TokensSerpro } from "./serpro/integra-contador";
import { carregarCredenciais, db, registrarChamada, soDigitos } from "./serpro/servidor";
import { LISTA_MODALIDADES, MODALIDADES, extrairAtivos, pdfDoDas, type Modalidade } from "./parcelamentos-regras";

export interface LinhaControle {
  id: number; cnpj: string; razao_social: string | null; modalidade: Modalidade;
  numero: number; situacao: string | null; atualizado_em: string;
}

const validarCnpj = (raw: string) => {
  const c = soDigitos(raw);
  if (c.length !== 14 && c.length !== 11) throw new Error("CNPJ inválido.");
  return c;
};

/** Controle (banco) + nomes atualizados do Questor + carteira para o seletor. Grátis. */
export async function listarControle() {
  const { data, error } = await db().from("parcelamentos_sn").select("*").order("razao_social");
  if (error) throw new Error(error.message);
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
  } else avisoCarteira = "API Questor não configurada: digite o CNPJ.";
  const nomes = new Map(carteira.map((c) => [c.cnpj, c.nome]));
  const linhas = ((data ?? []) as LinhaControle[]).map((l) => ({ ...l, razao_social: nomes.get(l.cnpj) ?? l.razao_social }));
  return { linhas, carteira, avisoCarteira };
}

async function chamar(tokens: TokensSerpro, contratanteCnpj: string, cnpj: string, idSistema: string, idServico: string,
  metodo: "Consultar" | "Emitir", dados: unknown) {
  const r = await consumir({
    tokens, metodo, contratante: participante(contratanteCnpj), contribuinte: participante(cnpj),
    pedidoDados: { idSistema, idServico, versaoSistema: "1.0", dados: dados === "" ? "" : JSON.stringify(dados) },
  });
  return { http: r.httpStatus, dados: dadosDe(r), mensagens: textoMensagens(r) };
}

async function sessao() {
  const cred = await carregarCredenciais();
  if (!cred.contratante_cnpj) throw new Error("CNPJ contratante não configurado no Integra Contador.");
  return { tokens: await autenticar(cred), contratante: cred.contratante_cnpj };
}

/** Consulta as 4 modalidades (4 chamadas pagas) e sincroniza o controle da empresa. */
export async function consultarPedidos(cnpjRaw: string, razao: string | null, por: string) {
  const cnpj = validarCnpj(cnpjRaw);
  const { tokens, contratante } = await sessao();
  const res = await Promise.all(LISTA_MODALIDADES.map(async (modalidade) => {
    const r = await chamar(tokens, contratante, cnpj, modalidade, MODALIDADES[modalidade].pedidos, "Consultar", "");
    return { modalidade, ...r };
  }));
  const falhas = res.filter((r) => r.http >= 400);
  const ativos = extrairAtivos(res);
  await registrarChamada("serpro-parcelamentos", "Parcelamentos: consultar pedidos", cnpj, falhas.length === 0, {
    ativos, falhas: falhas.map((f) => ({ modalidade: f.modalidade, http: f.http, mensagens: f.mensagens.slice(0, 300) })), por,
  });
  if (falhas.length === LISTA_MODALIDADES.length) {
    throw new Error(`A Receita recusou a consulta: ${falhas[0].mensagens || `HTTP ${falhas[0].http}`}`);
  }

  // Sincroniza: grava os ativos e remove os que saíram (só das modalidades que responderam).
  const agora = new Date().toISOString();
  if (ativos.length) {
    const { error } = await db().from("parcelamentos_sn").upsert(
      ativos.map((a) => ({ cnpj, razao_social: razao, modalidade: a.modalidade, numero: a.numero, situacao: a.situacao, atualizado_em: agora })),
      { onConflict: "cnpj,modalidade,numero" });
    if (error) throw new Error(error.message);
  }
  const responderam = res.filter((r) => r.http < 400).map((r) => r.modalidade);
  const { data: atuais } = await db().from("parcelamentos_sn").select("id, modalidade, numero").eq("cnpj", cnpj);
  const remover = ((atuais ?? []) as { id: number; modalidade: Modalidade; numero: number }[])
    .filter((l) => responderam.includes(l.modalidade) && !ativos.some((a) => a.modalidade === l.modalidade && a.numero === l.numero))
    .map((l) => l.id);
  if (remover.length) await db().from("parcelamentos_sn").delete().in("id", remover);

  return {
    ativos, removidos: remover.length,
    historico: res.map((r) => ({ modalidade: r.modalidade, http: r.http, mensagens: r.mensagens,
      pedidos: ((r.dados as { parcelamentos?: unknown[] } | null)?.parcelamentos ?? []) })),
    aviso: falhas.length ? `Sem resposta em: ${falhas.map((f) => f.modalidade).join(", ")}.` : null,
  };
}

/** Detalhe (OBTERPARC) + parcelas para gerar, em paralelo: 2 chamadas pagas. */
export async function detalhe(cnpjRaw: string, modalidade: Modalidade, numero: number, por: string) {
  const cnpj = validarCnpj(cnpjRaw);
  const { tokens, contratante } = await sessao();
  const s = MODALIDADES[modalidade];
  const [o, p] = await Promise.all([
    chamar(tokens, contratante, cnpj, modalidade, s.obter, "Consultar", { numeroParcelamento: Number(numero) }),
    chamar(tokens, contratante, cnpj, modalidade, s.parcelas, "Consultar", ""),
  ]);
  await registrarChamada("serpro-parcelamentos", "Parcelamentos: detalhe", cnpj, o.http < 400, {
    modalidade, numero, http: [o.http, p.http], mensagens: `${o.mensagens} ${p.mensagens}`.slice(0, 500), por,
  });
  return {
    parcelamento: o.dados, erroParcelamento: o.http >= 400 || !o.dados ? (o.mensagens || `HTTP ${o.http}`) : null,
    parcelas: ((p.dados as { listaParcelas?: { parcela: number; valor: number }[] } | null)?.listaParcelas ?? []),
    erroParcelas: p.http >= 400 ? (p.mensagens || `HTTP ${p.http}`) : null,
  };
}

/** Só as parcelas para gerar (1 chamada paga) — usado no lote. */
export async function parcelas(cnpjRaw: string, modalidade: Modalidade) {
  const cnpj = validarCnpj(cnpjRaw);
  const { tokens, contratante } = await sessao();
  const p = await chamar(tokens, contratante, cnpj, modalidade, MODALIDADES[modalidade].parcelas, "Consultar", "");
  if (p.http >= 400) throw new Error(p.mensagens || `HTTP ${p.http}`);
  return ((p.dados as { listaParcelas?: { parcela: number; valor: number }[] } | null)?.listaParcelas ?? []);
}

/** Emite o DAS da parcela (1 chamada paga). */
export async function gerarDas(cnpjRaw: string, modalidade: Modalidade, parcela: number, por: string) {
  const cnpj = validarCnpj(cnpjRaw);
  if (!/^\d{6}$/.test(String(parcela))) throw new Error("Parcela inválida (AAAAMM).");
  const { tokens, contratante } = await sessao();
  const r = await chamar(tokens, contratante, cnpj, modalidade, MODALIDADES[modalidade].gerar, "Emitir", { parcelaParaEmitir: Number(parcela) });
  const pdf = pdfDoDas(r.dados);
  await registrarChamada("serpro-parcelamentos", `Parcelamentos: DAS ${modalidade}`, cnpj, !!pdf, {
    modalidade, parcela, http: r.http, mensagens: r.mensagens.slice(0, 500), por,
  });
  return pdf ? { ok: true as const, pdf } : { ok: false as const, mensagem: r.mensagens || `A Receita não devolveu o DAS (HTTP ${r.http}).` };
}

export async function remover(id: number) {
  const { error } = await db().from("parcelamentos_sn").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
