// Fiscal · Situação Fiscal (SITFIS) — acesso a dados e consulta à Receita. SERVIDOR.
//
// Carteira = empresas ativas da API Questor, cruzadas por CNPJ com a tabela
// situacao_fiscal (docs/situacao-fiscal-migration.sql). Cada consulta à
// Receita é PAGA e gera relatório novo: só acontece por clique, uma empresa
// por requisição (o lote é um laço no navegador, com progresso e parar).

import { getEmpresas, hasApiKey } from "./questor";
import { comGrupo, mapaGrupos } from "./grupos-processamento";
import {
  autenticar, consumir, dadosDe, participante, textoMensagens,
  type Participante, type TokensSerpro,
} from "./serpro/integra-contador";
import { extrairDebitos } from "./recalculo-regras";
import { classificarRelatorio, textoDoPdf, REGRA_VERSAO, type Classificacao, type Situacao } from "./situacao-fiscal-pdf";
import { carregarCredenciais, db, registrarChamada, soDigitos } from "./serpro/servidor";

export { REGRA_VERSAO };
export type { Situacao };

export { soDigitos };

/** Colunas da listagem — sem o PDF, que é pesado. */
const COLUNAS = "cnpj, razao_social, situacao, pendencias, resumo, mensagem, consultado_em, "
  + "simples_opcao, simples_inclusao, simples_exclusao, simples_periodos, "
  + "simei_opcao, simei_inclusao, simei_exclusao, certidao_tipo, certidao_validade, regra_versao, tem_pdf";

export interface LinhaSituacao {
  cnpj: string;
  razao_social: string | null;
  codigoempresa: number | null;
  ativa_questor: boolean;
  situacao: Situacao | null;
  pendencias: number | null;
  resumo: string | null;
  mensagem: string | null;
  consultado_em: string | null;
  simples_opcao: boolean | null;
  simples_inclusao: string | null;
  simples_exclusao: string | null;
  simei_opcao: boolean | null;
  simei_inclusao: string | null;
  simei_exclusao: string | null;
  certidao_tipo: string | null;
  certidao_validade: string | null;
  tem_pdf: boolean;
  grupo_codigo?: number | null;
  grupo_desc?: string | null;
}

type Registro = Omit<LinhaSituacao, "codigoempresa" | "ativa_questor">;

/**
 * Carteira ativa do Questor + o que já foi consultado. Empresas consultadas
 * que saíram da carteira continuam na lista (marcadas), para não sumir histórico.
 */
export async function listarCarteira(): Promise<{ linhas: LinhaSituacao[]; avisoCarteira: string | null }> {
  const sb = db();
  const { data, error } = await sb.from("situacao_fiscal_lista").select(COLUNAS);
  if (error) throw new Error(error.message);
  const porCnpj = new Map<string, Registro>((data as unknown as Registro[]).map((r) => [r.cnpj, r]));

  let avisoCarteira: string | null = null;
  const linhas: LinhaSituacao[] = [];
  const vistos = new Set<string>();

  if (hasApiKey()) {
    try {
      const { dados } = await getEmpresas(true);
      for (const e of dados) {
        const cnpj = soDigitos(e.cnpj);
        if (cnpj.length !== 14 || vistos.has(cnpj)) continue;
        vistos.add(cnpj);
        const r = porCnpj.get(cnpj);
        linhas.push({
          ...vazio(cnpj), ...(r ?? {}),
          razao_social: e.nome ?? r?.razao_social ?? null,
          codigoempresa: e.codigoempresa, ativa_questor: true,
        });
      }
    } catch (e) {
      avisoCarteira = `Não consegui ler a carteira do Questor (${e instanceof Error ? e.message : "erro"}). Mostrando só as já consultadas.`;
    }
  } else {
    avisoCarteira = "API Questor não configurada: mostrando só as empresas já consultadas.";
  }

  for (const r of porCnpj.values()) {
    if (vistos.has(r.cnpj)) continue;
    linhas.push({ ...vazio(r.cnpj), ...r, codigoempresa: null, ativa_questor: false });
  }
  linhas.sort((a, b) => (a.razao_social ?? "").localeCompare(b.razao_social ?? "", "pt-BR"));
  return { linhas: comGrupo(linhas, await mapaGrupos(true).catch(() => new Map())), avisoCarteira };
}

function vazio(cnpj: string): LinhaSituacao {
  return {
    cnpj, razao_social: null, codigoempresa: null, ativa_questor: false,
    situacao: null, pendencias: null, resumo: null, mensagem: null, consultado_em: null,
    simples_opcao: null, simples_inclusao: null, simples_exclusao: null,
    simei_opcao: null, simei_inclusao: null, simei_exclusao: null,
    certidao_tipo: null, certidao_validade: null, tem_pdf: false,
  };
}

export async function obterPdf(cnpj: string): Promise<string | null> {
  const { data, error } = await db().from("situacao_fiscal").select("pdf_base64").eq("cnpj", soDigitos(cnpj)).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.pdf_base64 ?? null;
}

const ESPERA_MAX_MS = 12_000;
const TENTATIVAS = 4;
const dorme = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

type ResultadoSitfis =
  | ({ ok: true; protocolo: string; pdf_base64: string; mensagem: string } & Classificacao)
  | { ok: false; situacao: "erro"; protocolo: string | null; mensagem: string };

/** SOLICITARPROTOCOLO91 -> RELATORIOSITFIS92 (repete enquanto vier 202). */
async function consultarSitfis(tokens: TokensSerpro, contratante: Participante, cnpj: string): Promise<ResultadoSitfis> {
  const contribuinte = participante(cnpj);
  const rp = await consumir({
    tokens, metodo: "Apoiar", contratante, contribuinte,
    pedidoDados: { idSistema: "SITFIS", idServico: "SOLICITARPROTOCOLO91", versaoSistema: "2.0", dados: "" },
  });
  const dp = (dadosDe(rp) ?? {}) as { protocoloRelatorio?: string; protocolo?: string; tempoEspera?: number };
  const protocolo = dp.protocoloRelatorio ?? dp.protocolo ?? null;
  if (!protocolo) {
    return { ok: false, situacao: "erro", protocolo: null, mensagem: `Não veio protocolo (HTTP ${rp.httpStatus}). ${textoMensagens(rp)}`.trim() };
  }

  let espera = Number(dp.tempoEspera ?? 0);
  for (let n = 0; n < TENTATIVAS; n++) {
    if (espera > 0) await dorme(Math.min(espera, ESPERA_MAX_MS));
    const rr = await consumir({
      tokens, metodo: "Emitir", contratante, contribuinte,
      pedidoDados: {
        idSistema: "SITFIS", idServico: "RELATORIOSITFIS92", versaoSistema: "2.0",
        dados: JSON.stringify({ protocoloRelatorio: protocolo }),
      },
    });
    const d = dadosDe(rr);
    const obj = (Array.isArray(d) ? d[0] : d) as { pdf?: string; PDF?: string; pdfByteArrayBase64?: string; tempoEspera?: number } | null;
    const pdf = obj?.pdf ?? obj?.PDF ?? obj?.pdfByteArrayBase64;
    if (pdf) {
      return { ok: true, protocolo, pdf_base64: pdf, mensagem: textoMensagens(rr) || "Relatório obtido.", ...classificarRelatorio(pdf) };
    }
    if (rr.httpStatus === 202) { espera = Number(obj?.tempoEspera ?? 3000); continue; }
    return { ok: false, situacao: "erro", protocolo, mensagem: `Sem PDF no retorno (HTTP ${rr.httpStatus}). ${textoMensagens(rr)}`.trim() };
  }
  return { ok: false, situacao: "erro", protocolo, mensagem: "Relatório ainda em preparo na Receita. Tente de novo em instantes." };
}

/** Consulta UMA empresa na Receita (chamada paga) e grava o resultado. */
export async function consultarEmpresa(cnpjRaw: string, razaoSocial: string | null, porEmail: string) {
  const cnpj = soDigitos(cnpjRaw);
  if (cnpj.length !== 14) throw new Error("CNPJ inválido.");

  const cred = await carregarCredenciais();
  const tokens = await autenticar(cred);
  const r = await consultarSitfis(tokens, participante(cred.contratante_cnpj), cnpj);

  const agora = new Date().toISOString();
  const registro: Record<string, unknown> = {
    cnpj,
    situacao: r.situacao,
    pendencias: r.ok ? r.pendencias : null,
    resumo: r.ok ? r.resumo : null,
    protocolo: r.protocolo,
    mensagem: r.mensagem,
    consultado_em: agora,
    updated_at: agora,
  };
  if (razaoSocial) registro.razao_social = razaoSocial;
  if (r.ok) {
    Object.assign(registro, camposExtras(r), { pdf_base64: r.pdf_base64, regra_versao: REGRA_VERSAO, debitos: debitosDoPdf(r.pdf_base64) });
  }

  const { error } = await db().from("situacao_fiscal").upsert(registro, { onConflict: "cnpj" });
  if (error) throw new Error(error.message);
  await registrarChamada("serpro-sitfis", "Consulta Situação Fiscal", cnpj, r.ok,
    { situacao: r.situacao, mensagem: r.mensagem, protocolo: r.protocolo, por: porEmail });

  return { ok: r.ok, cnpj, situacao: r.situacao, mensagem: r.mensagem };
}

/** Débitos exigíveis do SIEF, usados pelo módulo Recálculos. */
function debitosDoPdf(pdf: string | null | undefined) {
  if (!pdf) return null;
  try { return extrairDebitos(textoDoPdf(pdf)); } catch { return null; }
}

function camposExtras(c: Classificacao) {
  return {
    simples_opcao: c.simples_opcao ?? null, simples_inclusao: c.simples_inclusao ?? null,
    simples_exclusao: c.simples_exclusao ?? null, simples_periodos: c.simples_periodos ?? null,
    simei_opcao: c.simei_opcao ?? null, simei_inclusao: c.simei_inclusao ?? null, simei_exclusao: c.simei_exclusao ?? null,
    certidao_tipo: c.certidao_tipo ?? null, certidao_validade: c.certidao_validade ?? null,
  };
}

/**
 * Reaplica a regra atual sobre os PDFs já salvos, em blocos — sem chamar a
 * Receita. Devolve quantos restam para a tela repetir até zerar.
 */
export async function reclassificarBloco(limite = 25) {
  const sb = db();
  const versao = `regra_versao.is.null,regra_versao.neq.${REGRA_VERSAO}`;

  const { data, error } = await sb.from("situacao_fiscal").select("cnpj, pdf_base64, situacao")
    .not("pdf_base64", "is", null).or(versao).limit(Math.min(limite, 60));
  if (error) throw new Error(error.message);

  let mudaram = 0;
  for (const l of data ?? []) {
    const c = classificarRelatorio(l.pdf_base64);
    const { error: e2 } = await sb.from("situacao_fiscal").update({
      situacao: c.situacao, pendencias: c.pendencias, resumo: c.resumo, ...camposExtras(c), debitos: debitosDoPdf(l.pdf_base64),
      regra_versao: REGRA_VERSAO, updated_at: new Date().toISOString(),
    }).eq("cnpj", l.cnpj);
    if (e2) throw new Error(e2.message);
    if (c.situacao !== l.situacao) mudaram++;
  }

  const { count } = await sb.from("situacao_fiscal").select("cnpj", { count: "exact", head: true })
    .not("pdf_base64", "is", null).or(versao);
  return { processadas: data?.length ?? 0, mudaram, restantes: count ?? 0, regra: REGRA_VERSAO };
}
