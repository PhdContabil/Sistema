// Fiscal · DCTFWeb — dados e operações na Receita (Integra Contador). SERVIDOR.
//
// Quem deve entregar vem do Questor (/fiscal/dctfweb-obrigadas): sincroniza
// para a tabela dctfweb (docs/dctfweb-migration.sql), que guarda o estado
// nosso (situação na RFB, recibo, guia, trava). Toda chamada ao SERPRO é paga
// e explícita: por clique (uma empresa por requisição, lote no navegador) ou
// pela rotina automática do dia configurado (app/api/fiscal/dctfweb/cron).
// Vindo de app-empresas-integra/lib/dctfwebCore.mjs.

import { getDctfwebObrigadas } from "./questor";
import { atualizarGrupos, comGrupo, mapaGrupos } from "./grupos-processamento";
import {
  autenticar, consumir, dadosDe, loadPfx, participante,
  type CredenciaisSerpro, type Participante, type TokensSerpro,
} from "./serpro/integra-contador";
import { assinarProcDctf } from "./serpro/assinatura-xml";
import { carregarCredenciais, db, registrarChamada, soDigitos } from "./serpro/servidor";
import {
  ehJaTransmitida, motivoBloqueioTransmissao, motivoSemGuia, origemDoXml, situacaoDasMensagens,
  transmissaoComSucesso, valorDoXml, xmlDosDados, type Mensagem, type SituacaoDctf,
} from "./dctfweb-regras";

export * from "./dctfweb-regras";

export interface LinhaDctf {
  id: number;
  cnpj: string;
  razao_social: string | null;
  codigoempresa: number | null;
  competencia: string;
  situacao: SituacaoDctf;
  tem_recibo: boolean | null;
  recibo_numero: string | null;
  debito: number | null;
  debito_folha: number | null;
  debito_reinf: number | null;
  origem: string | null;
  valor_guia: number | null;
  nao_transmitir: boolean;
  transmitida_em: string | null;
  transmissao_erro: string | null;
  ultima_consulta: string | null;
  grupos?: { c: number; d: string | null }[];
  grupo_desc?: string | null;
}

const COLUNAS = "id, cnpj, razao_social, codigoempresa, competencia, situacao, tem_recibo, recibo_numero, debito, "
  + "debito_folha, debito_reinf, origem, valor_guia, nao_transmitir, transmitida_em, transmissao_erro, ultima_consulta";

export const validarCompetencia = (c: string | null | undefined): string => {
  if (!c || !/^\d{4}-(0[1-9]|1[0-2])$/.test(c)) throw new Error("Competência inválida (use AAAA-MM).");
  return c;
};

// ---------------------------------------------------------------- leitura

export async function competenciasSalvas(): Promise<string[]> {
  const { data, error } = await db().rpc("dctfweb_competencias");
  if (!error && Array.isArray(data)) return (data as { competencia: string }[]).map((x) => x.competencia);
  // sem a função no banco: varre (poucos milhares de linhas)
  const { data: d2, error: e2 } = await db().from("dctfweb").select("competencia").limit(20000);
  if (e2) throw new Error(e2.message);
  return [...new Set((d2 ?? []).map((x) => x.competencia as string))].sort().reverse();
}

export async function listar(competencia: string): Promise<LinhaDctf[]> {
  const { data, error } = await db().from("dctfweb").select(COLUNAS)
    .eq("competencia", validarCompetencia(competencia)).order("razao_social");
  if (error) throw new Error(error.message);
  return comGrupo((data ?? []) as unknown as LinhaDctf[], await mapaGrupos(true).catch(() => new Map()));
}

async function linha(id: number): Promise<LinhaDctf> {
  const { data, error } = await db().from("dctfweb").select(COLUNAS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Declaração não encontrada.");
  return data as unknown as LinhaDctf;
}

async function atualizar(id: number, campos: Record<string, unknown>) {
  const { error } = await db().from("dctfweb").update({ ...campos, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------- sincronização

/**
 * Traz do Questor quem deve entregar na competência (sem custo). Atualiza os
 * débitos; não mexe em situação/recibo/trava de quem já existe.
 */
export async function sincronizarObrigadas(competencia: string) {
  const [ano, mes] = validarCompetencia(competencia).split("-").map(Number);
  const { dados } = await getDctfwebObrigadas({ ano, mes });
  const agora = new Date().toISOString();
  const porCnpj = new Map<string, Record<string, unknown>>();
  for (const o of dados) {
    if (o.deve_entregar === false) continue;
    const cnpj = soDigitos(o.cnpj);
    if (cnpj.length !== 14) continue;
    porCnpj.set(cnpj, {
      cnpj, competencia, razao_social: o.nome, codigoempresa: o.codigoempresa, obrigada: true,
      debito: o.debito_apurado ?? null, debito_folha: o.total_folha ?? null, debito_reinf: o.total_reinf ?? null,
      updated_at: agora,
    });
  }
  const rows = [...porCnpj.values()];
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db().from("dctfweb").upsert(rows.slice(i, i + 500), { onConflict: "cnpj,competencia" });
    if (error) throw new Error(error.message);
  }
  // aproveita para atualizar os grupos de processamento (como no app antigo)
  let grupos: { recebidos?: number; erro?: string };
  try { grupos = await atualizarGrupos(); } catch (e) { grupos = { erro: e instanceof Error ? e.message : String(e) }; }
  return { competencia, recebidas: dados.length, gravadas: rows.length, grupos };
}

// ------------------------------------------------------------ SERPRO base

interface Sessao { tokens: TokensSerpro; contratante: Participante; cred: CredenciaisSerpro }

export async function abrirSessao(): Promise<Sessao> {
  const cred = await carregarCredenciais();
  return { cred, tokens: await autenticar(cred), contratante: participante(cred.contratante_cnpj) };
}

function pedir(s: Sessao, cnpj: string, metodo: "Consultar" | "Emitir" | "Declarar", idServico: string, dados: Record<string, unknown>) {
  return consumir({
    tokens: s.tokens, metodo, contratante: s.contratante, contribuinte: participante(cnpj),
    pedidoDados: { idSistema: "DCTFWEB", idServico, versaoSistema: "1.0", dados: JSON.stringify(dados) },
  });
}

const periodo = (competencia: string) => {
  const [ano, mes] = competencia.split("-");
  return { categoria: 40, anoPA: ano, mesPA: mes };
};

async function xmlDaDeclaracao(s: Sessao, l: LinhaDctf) {
  const r = await pedir(s, l.cnpj, "Consultar", "CONSXMLDECLARACAO38", periodo(l.competencia));
  return { r, xml: xmlDosDados(dadosDe(r)) };
}

// -------------------------------------------------------------- consultar

/** Situação na RFB (CONSDECCOMPLETA33) + origem e valor da guia (XML). */
export async function consultar(id: number, s?: Sessao) {
  const l = await linha(id);
  const sessao = s ?? await abrirSessao();
  const agora = new Date().toISOString();
  try {
    const rd = await pedir(sessao, l.cnpj, "Consultar", "CONSDECCOMPLETA33", periodo(l.competencia));
    const situacao = situacaoDasMensagens(rd.httpStatus, rd.json?.mensagens as Mensagem[], rd.json?.dados);
    let origem: string | null = null, valor_guia: number | null = null;
    try {
      const { xml } = await xmlDaDeclaracao(sessao, l);
      origem = origemDoXml(xml);
      valor_guia = valorDoXml(xml);
    } catch { /* XML é complemento: sem ele a situação ainda vale */ }
    await atualizar(id, {
      situacao, tem_recibo: situacao === "transmitida", ultima_consulta: agora,
      ...(origem != null ? { origem } : {}), ...(valor_guia != null ? { valor_guia } : {}),
    });
    return { ok: true, id, situacao, origem, valor_guia };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await atualizar(id, { situacao: "erro", transmissao_erro: msg.slice(0, 300), ultima_consulta: agora });
    return { ok: false, id, situacao: "erro" as const, mensagem: msg };
  }
}

// ------------------------------------------------------------- transmitir

/**
 * Transmite UMA declaração: XML da RFB -> assina -> TRANSDECLARACAO310.
 * Irreversível. "Já transmitida" na resposta só corrige a situação.
 */
export async function transmitir(id: number, opts: { consultarAntes?: boolean; por?: string; semMovimento?: boolean } = {}, s?: Sessao) {
  const l = await linha(id);
  const bloqueio = opts.semMovimento ? null : motivoBloqueioTransmissao(l);
  if (bloqueio) return { ok: false, id, pulou: true, motivo: bloqueio };

  const sessao = s ?? await abrirSessao();
  const agora = new Date().toISOString();
  const registrar = (ok: boolean, detalhe: Record<string, unknown>) =>
    registrarChamada("serpro-dctfweb", "Transmissão DCTFWeb", l.cnpj, ok, { competencia: l.competencia, por: opts.por ?? "rotina", ...detalhe });

  try {
    if (opts.consultarAntes) {
      const rd = await pedir(sessao, l.cnpj, "Consultar", "CONSDECCOMPLETA33", periodo(l.competencia));
      if (situacaoDasMensagens(rd.httpStatus, rd.json?.mensagens as Mensagem[], rd.json?.dados) === "transmitida") {
        await atualizar(id, { situacao: "transmitida", tem_recibo: true, ultima_consulta: agora });
        return { ok: true, id, pulou: true, motivo: "já transmitida (consulta prévia)" };
      }
    }

    const { r: rx, xml } = await xmlDaDeclaracao(sessao, l);
    if (!xml) {
      const erro = `Sem XML da declaração (HTTP ${rx.httpStatus}).`;
      await atualizar(id, { situacao: "erro", transmissao_erro: erro, ultima_consulta: agora });
      await registrar(false, { etapa: "xml", erro });
      return { ok: false, id, etapa: "xml", mensagem: erro };
    }
    const origem = origemDoXml(xml), valor_guia = valorDoXml(xml);

    const { privateKeyPem, certificatePem } = loadPfx(sessao.cred.pfx_base64 ?? "", sessao.cred.pfx_senha ?? "");
    const assinado = assinarProcDctf(xml, { privateKeyPem, certificatePem });

    const rt = await pedir(sessao, l.cnpj, "Declarar", "TRANSDECLARACAO310", {
      ...periodo(l.competencia), xmlAssinadoBase64: Buffer.from(assinado, "utf-8").toString("base64"),
    });
    const msgs = (rt.json?.mensagens ?? []) as Mensagem[];
    const d = dadosDe(rt) as { numeroRecibo?: string; numRecibo?: string; recibo?: string } | null;

    if (transmissaoComSucesso(rt.httpStatus, msgs)) {
      const recibo = d?.numeroRecibo ?? d?.numRecibo ?? d?.recibo ?? null;
      await atualizar(id, {
        situacao: "transmitida", tem_recibo: true, recibo_numero: recibo, origem, valor_guia,
        transmitida_em: agora, ultima_consulta: agora, transmissao_erro: null,
      });
      await registrar(true, { recibo, valor_guia });
      return { ok: true, id, transmitida: true, recibo, origem, valor_guia };
    }
    if (ehJaTransmitida(msgs)) {
      await atualizar(id, { situacao: "transmitida", tem_recibo: true, ultima_consulta: agora, transmissao_erro: null, origem, valor_guia });
      return { ok: true, id, pulou: true, motivo: "já transmitida (Receita)" };
    }
    const erro = `HTTP ${rt.httpStatus}: ${msgs.map((m) => `${m.codigo ?? ""} ${m.texto ?? ""}`.trim()).join(" | ") || String(rt.raw).slice(-300)}`;
    await atualizar(id, { situacao: "erro", transmissao_erro: erro.slice(0, 500), ultima_consulta: agora });
    await registrar(false, { etapa: "transmitir", erro: erro.slice(0, 500) });
    return { ok: false, id, etapa: "transmitir", mensagem: erro };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await atualizar(id, { situacao: "erro", transmissao_erro: msg.slice(0, 300), ultima_consulta: agora });
    await registrar(false, { etapa: "excecao", erro: msg.slice(0, 300) });
    return { ok: false, id, etapa: "excecao", mensagem: msg };
  }
}

/** Lote da competência, para a rotina automática: respeita orçamento de tempo e devolve o que falta. */
export async function transmitirLote(competencia: string, opts: { budgetMs: number; inicio: string }) {
  // Todas, inclusive as já transmitidas. Quem já passou NESTA rodada (ultima_consulta
  // >= inicio, gravado em todo resultado, inclusive erro) não entra de novo.
  const { data, error } = await db().from("dctfweb").select("id, situacao, nao_transmitir, debito, ultima_consulta")
    .eq("competencia", validarCompetencia(competencia)).eq("nao_transmitir", false)
    .or(`ultima_consulta.is.null,ultima_consulta.lt.${opts.inicio}`).limit(2000);
  if (error) throw new Error(error.message);
  const elegiveis = (data ?? []).filter((l) => !motivoBloqueioTransmissao(l as never));
  if (!elegiveis.length) return { processadas: 0, transmitidas: 0, pulou: 0, erros: 0, restantes: 0 };

  const s = await abrirSessao();
  const t0 = Date.now();
  let processadas = 0, transmitidas = 0, pulou = 0, erros = 0;
  for (const l of elegiveis) {
    if (Date.now() - t0 > opts.budgetMs) break;
    processadas++;
    const r = await transmitir(l.id as number, { por: "rotina automática" }, s);
    if (r.ok && "transmitida" in r) transmitidas++;
    else if (r.ok) pulou++;
    else erros++;
  }
  return { processadas, transmitidas, pulou, erros, restantes: elegiveis.length - processadas };
}

// ------------------------------------------------------------ guia/recibo

/**
 * Guia (DARF): GERARGUIA31 para transmitida, GERARGUIAANDAMENTO313 para em
 * andamento. Sem PDF, tenta o outro serviço (a situação gravada pode estar velha).
 */
export async function emitirGuia(id: number) {
  const l = await linha(id);
  const s = await abrirSessao();
  const emitir = async (idServico: string) => {
    const r = await pedir(s, l.cnpj, "Emitir", idServico, periodo(l.competencia));
    const d = dadosDe(r) as { PDFByteArrayBase64?: string; pdf?: string } | null;
    return { r, idServico, pdf: d?.PDFByteArrayBase64 ?? d?.pdf ?? null };
  };
  const primeiro = l.situacao === "transmitida" ? "GERARGUIA31" : "GERARGUIAANDAMENTO313";
  const outro = primeiro === "GERARGUIA31" ? "GERARGUIAANDAMENTO313" : "GERARGUIA31";

  let out = await emitir(primeiro);
  if (!out.pdf && /exce[çc][aã]o|inesper/i.test(JSON.stringify(out.r.json?.mensagens ?? []))) {
    await new Promise((r) => setTimeout(r, 1500)); // erro interno do SERPRO costuma ser transitório
    const de_novo = await emitir(primeiro);
    if (de_novo.pdf) out = de_novo;
  }
  let textos = JSON.stringify(out.r.json?.mensagens ?? []);
  if (!out.pdf) {
    const alt = await emitir(outro);
    textos += " " + JSON.stringify(alt.r.json?.mensagens ?? []);
    if (alt.pdf) {
      const situacao = outro === "GERARGUIA31" ? "transmitida" : "em_andamento";
      await atualizar(id, { situacao, tem_recibo: situacao === "transmitida" });
      out = alt;
    }
  }
  return out.pdf
    ? { ok: true as const, pdf: out.pdf, nome: `DARF_DCTFWeb_${l.cnpj}_${l.competencia}.pdf` }
    : { ok: false as const, mensagem: motivoSemGuia(textos) };
}

/** Recibo de entrega (CONSRECIBO32). */
export async function emitirRecibo(id: number) {
  const l = await linha(id);
  const s = await abrirSessao();
  const r = await pedir(s, l.cnpj, "Consultar", "CONSRECIBO32", periodo(l.competencia));
  const pdf = (dadosDe(r) as { PDFByteArrayBase64?: string } | null)?.PDFByteArrayBase64 ?? null;
  if (pdf) return { ok: true as const, pdf, nome: `Recibo_DCTFWeb_${l.cnpj}_${l.competencia}.pdf` };
  const t = JSON.stringify(r.json?.mensagens ?? []).toLowerCase();
  return {
    ok: false as const,
    mensagem: /n[aã]o foi encontrada/.test(t) ? "Sem recibo: a declaração não foi transmitida nesta competência."
      : /n[aã]o autorizado/.test(t) ? "Sem procuração/autorização para esta empresa." : "Recibo não disponível.",
  };
}

export async function definirTrava(id: number, valor: boolean) {
  await atualizar(id, { nao_transmitir: valor });
  return { ok: true, id, nao_transmitir: valor };
}

// ------------------------------------------------------------- parâmetros

export interface Parametros {
  dia_transmissao: number;
  auto_transmissao: boolean;
  consultar_antes: boolean;
  lote_ts: string | null;
  lote_inicio?: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

export async function obterParametros(): Promise<Parametros> {
  const { data, error } = await db().from("dctfweb_parametros")
    .select("dia_transmissao, auto_transmissao, consultar_antes, lote_ts, updated_at, updated_by, ambiente_reinf, lote_inicio").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? { dia_transmissao: 25, auto_transmissao: false, consultar_antes: false, lote_ts: null, updated_at: null, updated_by: null }) as Parametros;
}

export async function salvarParametros(p: { dia_transmissao: number; auto_transmissao: boolean; consultar_antes: boolean }, por: string) {
  const dia = Math.trunc(Number(p.dia_transmissao));
  if (!(dia >= 1 && dia <= 28)) throw new Error("O dia da transmissão deve ficar entre 1 e 28.");
  const { error } = await db().from("dctfweb_parametros").update({
    dia_transmissao: dia, auto_transmissao: !!p.auto_transmissao, consultar_antes: !!p.consultar_antes,
    updated_at: new Date().toISOString(), updated_by: por,
  }).eq("id", 1);
  if (error) throw new Error(error.message);
  return obterParametros();
}

export async function definirInicioLote(ts: string) {
  await db().from("dctfweb_parametros").update({ lote_inicio: ts }).eq("id", 1);
}

export async function definirTravaLote(ts: string | null) {
  await db().from("dctfweb_parametros").update({ lote_ts: ts }).eq("id", 1);
}

/** Últimas execuções da rotina automática (para a aba Parâmetros). */
export async function historicoRotina(limite = 15) {
  const { data } = await db().from("notificacoes_log").select("criado_em, sucesso, detalhe")
    .eq("canal", "dctfweb-rotina").order("criado_em", { ascending: false }).limit(limite);
  return data ?? [];
}

export async function registrarRotina(sucesso: boolean, detalhe: Record<string, unknown>) {
  await registrarChamada("dctfweb-rotina", "Rotina automática DCTFWeb", "-", sucesso, detalhe);
}
