// Emissão de NFS-e da PHD dentro do Núcleo — SERVIDOR.
//
// Padrão Nacional de NFS-e (Sefin Nacional). A prefeitura de Taboão
// (eTransparência) deixou de funcionar em 11/2026.
//   1. importar  — RPS do Questor (ou CSV do nSQL) vira linhas em nfse_notas;
//   2. emitir    — uma DPS por chamada (a Sefin não recebe lote); nDPS = número
//                  da RPS. A NFS-e volta na hora: guarda chave e XML;
//   3. pdf/zen   — DANFSe gerado do XML, publicado no Zen; número de volta no Questor.
import { createClient } from "@supabase/supabase-js";
import { linhaParaNota, type LinhaBruta, type NotaNfse } from "./formato";
import { validarNac, type NotaNac } from "./nacional-formato";
import { problemasConfig } from "./nacional-formato";
import { emitirNacional, consultarNfse, ibgePorCep, conferirCertificado, baixarDanfseOficial, NacionalError } from "./nacional";
import { carregarEmpresa } from "./empresas";
import { gerarDanfse } from "./danfse";
import { gravarNfseNoQuestor } from "../questor";
import { consultarCliente, uploadArquivo, importarDocumento, hasQuestorZenToken, ClienteNaoEncontradoError } from "../questor-zen";

/** Categoria do Edoc onde o app Python já publicava as NFS-e. */
const CATEGORIA_ZEN_NFSE = process.env.NFSE_ZEN_CATEGORIA ?? "57eab0380e380f1558afbccf";

export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Banco indisponível.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface LinhaNfse {
  id: number; codigoempresa: number; rps_serie: string; rps_numero: number; origem: string; arquivo: string | null;
  data_prestacao: string; valor: number; descricao: string; codigo_servico: string; observacao: string | null;
  tomador: NotaNfse["tomador"]; problemas: string[]; status: string; protocolo: string | null; erro: string | null;
  numero_nota: string | null; serie_nota: string | null; codigo_verificacao: string | null; data_emissao: string | null;
  link_pdf: string | null; pdf_ok: boolean; zen_documento_id: string | null; zen_erro: string | null;
  emitido_por: string | null; emitido_em: string | null;
  chave_acesso: string | null; nfse_xml: string | null; ambiente: number | null; questor_ok?: boolean;
}

/** Linha do banco -> DPS. O IBGE do tomador vem do Questor ou, se faltar, do CEP (ViaCEP). */
async function paraNac(l: LinhaNfse): Promise<NotaNac> {
  const t = l.tomador as NotaNfse["tomador"] & { ibge?: string };
  let ibge = (t.ibge ?? "").replace(/\D/g, "");
  if (ibge.length !== 7) {
    ibge = (await ibgePorCep(t.cep)) ?? "";
    if (ibge) await db().from("nfse_notas").update({ tomador: { ...t, ibge } }).eq("id", l.id);
  }
  return {
    nDPS: l.rps_numero, dCompet: l.data_prestacao, valor: Number(l.valor), descricao: l.descricao,
    infoCompl: l.observacao ?? "",
    tomador: {
      cpf_cnpj: t.cpf_cnpj, razao_social: t.razao_social, inscricao_municipal: t.inscricao_municipal, email: t.email,
      tipo_logradouro: t.tipo_logradouro, logradouro: t.logradouro, numero: t.numero, complemento: t.complemento,
      bairro: t.bairro, cep: t.cep, ibge,
    },
  };
}

const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/**
 * Grava as linhas importadas. RPS já emitida (ou marcada manual) não é
 * sobrescrita: reimportar o mesmo CSV é seguro.
 */
export async function importar(linhas: LinhaBruta[], origem: "csv" | "questor", arquivo: string | null, email: string, dataManual?: string | null, codigoempresa = 725) {
  const sb = db();
  // Data de prestação/competência informada na tela (exceção do mês atual) vale para todas as RPS do lote.
  const manual = dataManual && /^\d{4}-\d{2}-\d{2}$/.test(dataManual) ? dataManual : null;
  const notas = linhas.map((l) => linhaParaNota(l)).filter((x) => x.nota.rps_numero > 0)
    .map((x) => (manual ? { ...x, nota: { ...x.nota, data_prestacao: manual } } : x));
  const numeros = notas.map((x) => x.nota.rps_numero);
  const { data: existentes } = await sb.from("nfse_notas").select("rps_serie,rps_numero,status").eq("codigoempresa", codigoempresa).in("rps_numero", numeros.length ? numeros : [0]);
  const travadas = new Set((existentes ?? []).filter((e) => ["emitida", "manual", "emitindo"].includes(e.status)).map((e) => `${e.rps_serie}-${e.rps_numero}`));

  const novas = notas.filter((x) => !travadas.has(`${x.nota.rps_serie}-${x.nota.rps_numero}`)).map(({ nota, problemas }) => ({
    codigoempresa, rps_serie: nota.rps_serie, rps_numero: nota.rps_numero, origem, arquivo,
    data_prestacao: nota.data_prestacao, valor: nota.valor, descricao: nota.descricao,
    codigo_servico: nota.codigo_servico, observacao: nota.observacao || null, tomador: nota.tomador,
    problemas, status: "pendente", erro: null, importado_por: email, atualizado_em: new Date().toISOString(),
  }));
  if (novas.length) {
    const { error } = await sb.from("nfse_notas").upsert(novas, { onConflict: "codigoempresa,rps_serie,rps_numero" });
    if (error) throw new Error(error.message);
  }
  return {
    lidas: linhas.length, gravadas: novas.length, jaEmitidas: notas.length - novas.length,
    comProblema: novas.filter((n) => n.problemas.length).length,
  };
}

/** Notas avulsas (digitadas na tela) ficam numa série à parte, para não disputar número com as RPS do Questor. */
export const SERIE_AVULSA = "AV";
/** Série da DPS das avulsas: a seguinte à da empresa (1 -> 2). */
const serieDpsAvulsa = (serieEmpresa: string) => String((Number(serieEmpresa) || 1) + 1);

export interface DadosAvulsa {
  documento?: string; nome?: string; email?: string; cep?: string; tipo_logradouro?: string; logradouro?: string;
  numero?: string; complemento?: string; bairro?: string; municipio?: string; uf?: string;
  valor?: number | string; data?: string; descricao?: string; observacao?: string;
}

/** Cria uma nota avulsa (consumidor final / manual). Entra na lista como pendente, para conferir e emitir. */
export async function criarAvulsa(codigoempresa: number, d: DadosAvulsa, email: string): Promise<{ id: number; numero: number }> {
  const sb = db();
  const doc = String(d.documento ?? "").replace(/\D/g, "");
  if (doc.length !== 0 && doc.length !== 11 && doc.length !== 14) throw new Error("CPF com 11 dígitos, CNPJ com 14, ou deixe em branco (consumidor final).");
  const nome = String(d.nome ?? "").trim();
  if (doc && !nome) throw new Error("Informe o nome do tomador.");
  const bruto = String(d.valor ?? "").trim();
  const valor = Number(bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto);
  if (!(valor > 0)) throw new Error("Informe o valor da nota.");
  const data = String(d.data ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > hojeBR()) throw new Error("Data de prestação inválida (não pode ser futura).");
  const descricao = String(d.descricao ?? "").trim();
  if (!descricao) throw new Error("Descreva o serviço.");
  const cep = String(d.cep ?? "").replace(/\D/g, "");
  if (doc.length === 14 && (cep.length !== 8 || !String(d.logradouro ?? "").trim() || !String(d.bairro ?? "").trim())) {
    throw new Error("Tomador com CNPJ precisa de CEP, logradouro e bairro.");
  }
  const tomador = {
    cpf_cnpj: doc, razao_social: nome || "CONSUMIDOR FINAL", tipo_pessoa: doc.length === 14 ? "J" : "F",
    inscricao_municipal: "", email: String(d.email ?? "").trim(), tipo_logradouro: String(d.tipo_logradouro ?? "").trim(),
    logradouro: String(d.logradouro ?? "").trim(), numero: String(d.numero ?? "").trim() || "S/N",
    complemento: String(d.complemento ?? "").trim(), bairro: String(d.bairro ?? "").trim(),
    municipio: String(d.municipio ?? "").trim().toUpperCase(), uf: String(d.uf ?? "").trim().toUpperCase(), cep,
  };
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const { data: ult } = await sb.from("nfse_notas").select("rps_numero").eq("codigoempresa", codigoempresa)
      .eq("rps_serie", SERIE_AVULSA).order("rps_numero", { ascending: false }).limit(1);
    const numero = (ult?.[0]?.rps_numero ?? 0) + 1;
    const { data: nova, error } = await sb.from("nfse_notas").insert({
      codigoempresa, rps_serie: SERIE_AVULSA, rps_numero: numero, origem: "avulsa", data_prestacao: data,
      valor: Math.round(valor * 100) / 100, descricao, codigo_servico: "", observacao: String(d.observacao ?? "").trim() || null,
      tomador, problemas: [], status: "pendente", importado_por: email,
    }).select("id").single();
    if (!error && nova) return { id: nova.id, numero };
    if (!/duplicate|unique/i.test(error?.message ?? "")) throw new Error(error?.message ?? "Falha ao criar a nota.");
  }
  throw new Error("Não consegui reservar o número da nota avulsa. Tente de novo.");
}

export async function listar(filtro: { empresa?: number; status?: string; de?: number; ate?: number }) {
  let q = db().from("nfse_notas").select("*").eq("codigoempresa", filtro.empresa ?? 725).order("rps_numero", { ascending: false }).limit(500);
  if (filtro.status) q = q.eq("status", filtro.status);
  if (filtro.de) q = q.gte("rps_numero", filtro.de);
  if (filtro.ate) q = q.lte("rps_numero", filtro.ate);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as LinhaNfse[];
}

async function obter(id: number): Promise<LinhaNfse> {
  const { data } = await db().from("nfse_notas").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("Nota não encontrada.");
  return data as LinhaNfse;
}

export type ResultadoEmissao =
  | { ok: true; protocolo: string; numero: string | null; pdf: string }
  | { ok: false; aguardar: false; erro: string };

/**
 * Emite UMA nota no Padrão Nacional. A NFS-e volta na resposta; em seguida o
 * PDF é gerado, publicado no Zen e o número vai para o Questor.
 */
export async function emitirNota(id: number, email: string): Promise<ResultadoEmissao> {
  const sb = db();
  const l = await obter(id);
  if (l.status === "emitida" || l.status === "manual") return { ok: false, aguardar: false, erro: "Esta nota já foi emitida." };
  if (l.problemas?.length) return { ok: false, aguardar: false, erro: `Corrija antes de emitir: ${l.problemas.join("; ")}` };

  let emp: Awaited<ReturnType<typeof carregarEmpresa>>;
  try { emp = await carregarEmpresa(l.codigoempresa); }
  catch (e) { return { ok: false, aguardar: false, erro: e instanceof Error ? e.message : "Empresa sem configuração." }; }
  const nota = await paraNac(l);
  if (l.rps_serie === SERIE_AVULSA) nota.serie = serieDpsAvulsa(emp.cfg.serie);
  const prob = validarNac(nota, hojeBR(), emp.cfg.cnpj);
  if (prob.length) return { ok: false, aguardar: false, erro: prob.join("; ") };

  // Trava contra duplo clique / duas abas.
  const { data: preso } = await sb.from("nfse_notas").update({ status: "emitindo", atualizado_em: new Date().toISOString() })
    .eq("id", id).in("status", ["pendente", "erro"]).select("id");
  if (!preso?.length) return { ok: false, aguardar: false, erro: "Esta nota já está sendo emitida." };

  try {
    const r = await emitirNacional(nota, emp.cfg, emp.cert);
    if (!r.ok) {
      const msg = r.codigos.includes("E0014")
        ? `${r.erro} — Este número de DPS (${l.rps_numero}) já foi usado no Portal Nacional: provavelmente a nota JÁ FOI EMITIDA. Confira no portal e marque como manual.`
        : r.erro;
      await sb.from("nfse_notas").update({ status: "erro", erro: msg, atualizado_em: new Date().toISOString() }).eq("id", id);
      return { ok: false, aguardar: false, erro: msg };
    }
    await sb.from("nfse_notas").update({
      status: "emitida", erro: null, protocolo: r.chave, chave_acesso: r.chave, numero_nota: r.nNFSe,
      data_emissao: r.dhProc, nfse_xml: r.nfseXml, valor_liquido: r.vLiq ? Number(r.vLiq) : null,
      ambiente: emp.cfg.ambiente, emitido_por: email, emitido_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
    }).eq("id", id);
    // PDF/Zen/Questor ficam para depois (tela ao fim do lote e agendador a cada 10 min):
    // a emissão volta rápido e o lote anda.
    return { ok: true, protocolo: r.chave, numero: r.nNFSe, pdf: "PDF e Zen em seguida" };
  } catch (e) {
    const msg = e instanceof NacionalError || e instanceof Error ? e.message : "Falha ao emitir.";
    await sb.from("nfse_notas").update({ status: "erro", erro: msg, atualizado_em: new Date().toISOString() }).eq("id", id);
    return { ok: false, aguardar: false, erro: msg };
  }
}

/** Troca a data de prestação (competência) de uma RPS ainda não emitida. */
export async function alterarData(id: number, data: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error("Data inválida.");
  if (data > new Date().toISOString().slice(0, 10)) throw new Error("A prefeitura não aceita data futura.");
  const { data: r } = await db().from("nfse_notas").update({ data_prestacao: data, atualizado_em: new Date().toISOString() })
    .eq("id", id).in("status", ["pendente", "erro", "ignorada"]).select("id");
  if (!r?.length) throw new Error("Só dá para mudar a data de RPS ainda não emitida.");
}

/** Confere a nota sem emitir: dados do tomador, IBGE, certificado A1 e configuração. */
export async function verificarNota(id: number): Promise<{ status: "ok" | "erro"; mensagem: string }> {
  const l = await obter(id);
  try {
    const { empresa, cfg, cert: c } = await carregarEmpresa(l.codigoempresa);
    const nota = await paraNac(l);
    if (l.rps_serie === SERIE_AVULSA) nota.serie = serieDpsAvulsa(cfg.serie);
    const prob = [...(l.problemas ?? []), ...validarNac(nota, hojeBR(), cfg.cnpj)];
    const falta = problemasConfig(cfg);
    if (falta.length) prob.push(`Configuração da ${empresa.nome} incompleta: ${falta.join(", ")}`);
    try { conferirCertificado(c, cfg.cnpj); } catch (e) { prob.push(e instanceof Error ? e.message : "Certificado inválido"); }
    if (prob.length) return { status: "erro", mensagem: `RPS ${l.rps_numero}: ${prob.join("; ")}` };
    return { status: "ok", mensagem: `RPS ${l.rps_numero}: pronta para o Portal Nacional (${cfg.ambiente === 1 ? "PRODUÇÃO" : "produção restrita / teste"}). Certificado válido até ${c.validade.toLocaleDateString("pt-BR")}. Nada foi emitido.` };
  } catch (e) {
    return { status: "erro", mensagem: e instanceof Error ? e.message : "Falha ao verificar." };
  }
}

/** Nota emitida direto no Portal Nacional, à mão: marca e segue para a próxima. */
export async function marcarManual(id: number, email: string) {
  await db().from("nfse_notas").update({
    status: "manual", erro: null, emitido_por: email, emitido_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
  }).eq("id", id).neq("status", "emitida");
}

export async function ignorar(id: number, voltar: boolean) {
  await db().from("nfse_notas").update({ status: voltar ? "pendente" : "ignorada", atualizado_em: new Date().toISOString() })
    .eq("id", id).in("status", voltar ? ["ignorada"] : ["pendente", "erro"]);
}

function nomePdf(numeroNota: string, razao: string) {
  const s = razao.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 50);
  return `NFSe_${numeroNota}_${s}.pdf`;
}

/**
 * Gera o DANFSe a partir do XML da NFS-e, publica no Zen e grava o número no
 * Questor. Pode rodar de novo: o que já foi feito não se repete.
 */
export async function baixarEPublicar(id: number, opts: { aceitarProvisorio?: boolean } = {}): Promise<{ status: "ok" | "pendente" | "erro"; mensagem: string }> {
  const sb = db();
  const l = await obter(id);
  await sb.from("nfse_notas").update({ pdf_tentativas: ((l as LinhaNfse & { pdf_tentativas?: number }).pdf_tentativas ?? 0) + 1, pdf_ultima_tentativa: new Date().toISOString() }).eq("id", id);
  // Depois de NFSE_PDF_ESPERA_HORAS (padrão 6) sem o PDF oficial do Portal, o Zen
  // recebe o PDF do Núcleo, para a nota não ficar fora do Edoc indefinidamente.
  const espera = Number(process.env.NFSE_PDF_ESPERA_HORAS ?? 6) * 3600_000;
  const venceuEspera = !!l.emitido_em && Date.now() - new Date(l.emitido_em).getTime() > espera;
  const aceitaProvisorio = opts.aceitarProvisorio || venceuEspera;
  if (l.status !== "emitida") return { status: "erro", mensagem: "Só há PDF para notas emitidas pelo Núcleo (as manuais ficam no Portal Nacional)." };
  if (!l.chave_acesso) return { status: "erro", mensagem: "A nota não tem chave de acesso." };

  let xml = l.nfse_xml;
  if (!xml) {
    const emp = await carregarEmpresa(l.codigoempresa);
    xml = await consultarNfse(l.chave_acesso, (l.ambiente === 1 ? 1 : 2), emp.cert);
    if (!xml) return { status: "pendente", mensagem: "A Sefin ainda não devolveu o XML da NFS-e. Tente de novo em alguns minutos." };
    await sb.from("nfse_notas").update({ nfse_xml: xml }).eq("id", id);
  }
  const { bytes, origem } = await pdfOficialOuLocal(l, xml);
  await sb.from("nfse_notas").update({ pdf_ok: true, atualizado_em: new Date().toISOString() }).eq("id", id);
  const numero = l.numero_nota ?? String(l.rps_numero);

  // Número da NFS-e de volta no RPS do Questor (só em produção; não trava o resto).
  // A rota de gravação do Questor só cobre o escritório da PHD Contábil (725).
  if (l.ambiente === 1 && l.codigoempresa === 725 && l.rps_serie !== SERIE_AVULSA && l.numero_nota && !l.questor_ok) {
    try {
      const r = await gravarNfseNoQuestor(l.rps_serie, l.rps_numero, {
        usuario: "nucleo-financeiro", numero_nfse: l.numero_nota, serie_nfse: "nacional",
        codigo_verificacao: l.chave_acesso, data_emissao: l.data_emissao ?? new Date().toISOString(),
      }, { dryRun: false, idempotencyKey: `nucleo-nfse-${l.rps_serie}-${l.rps_numero}-${l.numero_nota}` });
      await sb.from("nfse_notas").update(r.ok
        ? { questor_ok: true, questor_erro: null }
        : { questor_erro: `HTTP ${r.status}: ${JSON.stringify(r.corpo.detail ?? r.corpo.erro ?? "").slice(0, 300)}` }).eq("id", id);
    } catch (e) {
      await sb.from("nfse_notas").update({ questor_erro: e instanceof Error ? e.message : "falha" }).eq("id", id);
    }
  }

  // Para o Zen só vai a nota oficial do Portal; se ela não veio, fica pendente para tentar de novo.
  if (origem !== "oficial" && !l.zen_documento_id && l.ambiente === 1 && !aceitaProvisorio) {
    return { status: "pendente", mensagem: `NFS-e ${l.numero_nota ?? l.rps_numero}: emitida; o Portal ainda não devolveu o PDF oficial. O sistema tenta de novo sozinho a cada 10 minutos.` };
  }
  if (l.zen_documento_id) return { status: "ok", mensagem: `NFS-e ${numero}: PDF ok, já estava no Zen.` };
  if (l.ambiente !== 1) return { status: "ok", mensagem: `NFS-e ${numero}: PDF ok (teste — não vai para o Zen).` };
  if (!hasQuestorZenToken()) return { status: "ok", mensagem: `NFS-e ${numero}: PDF ok. Zen não configurado.` };
  if (!l.tomador.cpf_cnpj) return { status: "ok", mensagem: `NFS-e ${numero}: PDF ok (consumidor final, sem cliente no Zen).` };
  try {
    const cliente = await consultarCliente(l.tomador.cpf_cnpj);
    const arquivo = await uploadArquivo(nomePdf(numero, l.tomador.razao_social), bytes);
    const [a, m, d] = l.data_prestacao.split("-");
    const doc = await importarDocumento({
      codigoCategoria: CATEGORIA_ZEN_NFSE, codigoCliente: cliente.CodigoCliente, codigoArquivo: arquivo,
      titulo: `NFS-e ${numero} - ${l.tomador.razao_social.slice(0, 50)}`,
      observacao: `NFS-e (Padrão Nacional) emitida pelo Núcleo Contábil. RPS ${l.rps_serie}-${l.rps_numero}`,
      dataCompetencia: `${d}/${m}/${a}`, valor: Number(l.valor).toFixed(2),
    });
    await sb.from("nfse_notas").update({ zen_documento_id: doc, zen_erro: null }).eq("id", id);
    return { status: "ok", mensagem: `NFS-e ${numero} publicada no Zen.` };
  } catch (e) {
    const msg = e instanceof ClienteNaoEncontradoError ? "Cliente não cadastrado no Zen (CRM > Clientes)." : e instanceof Error ? e.message : "Falha no Zen.";
    await sb.from("nfse_notas").update({ zen_erro: msg }).eq("id", id);
    return { status: "ok", mensagem: `NFS-e ${numero}: PDF ok, mas não subiu para o Zen: ${msg}` };
  }
}

/**
 * PDF da nota: primeiro o DANFSe OFICIAL do Portal Nacional; se o serviço não
 * responder, um espelho gerado do XML (marcado como não oficial no histórico).
 */
async function pdfOficialOuLocal(l: LinhaNfse, xml: string): Promise<{ bytes: Buffer; origem: "oficial" | "local" }> {
  const sb = db();
  try {
    const emp = await carregarEmpresa(l.codigoempresa);
    const r = await baixarDanfseOficial(l.chave_acesso!, l.ambiente === 1 ? 1 : 2, emp.cert);
    if (r.pdf) {
      await sb.from("nfse_notas").update({ pdf_origem: "oficial", pdf_oficial_erro: null }).eq("id", l.id);
      return { bytes: r.pdf, origem: "oficial" };
    }
    await sb.from("nfse_notas").update({ pdf_origem: "local", pdf_oficial_erro: r.motivo.slice(0, 400) }).eq("id", l.id);
  } catch (e) {
    await sb.from("nfse_notas").update({ pdf_origem: "local", pdf_oficial_erro: e instanceof Error ? e.message.slice(0, 400) : "falha" }).eq("id", l.id);
  }
  return { bytes: await gerarDanfse(xml, l.chave_acesso!, l.ambiente ?? 2), origem: "local" };
}

/** PDF da nota para abrir/baixar na tela. */
export async function pdfDaNota(id: number): Promise<{ nome: string; bytes: Buffer }> {
  const l = await obter(id);
  if (!l.chave_acesso) throw new Error("Nota sem chave de acesso.");
  const xml = l.nfse_xml ?? (await consultarNfse(l.chave_acesso, (l.ambiente === 1 ? 1 : 2), (await carregarEmpresa(l.codigoempresa)).cert));
  if (!xml) throw new Error("XML da NFS-e ainda indisponível.");
  return { nome: nomePdf(l.numero_nota ?? String(l.rps_numero), l.tomador.razao_social), bytes: (await pdfOficialOuLocal(l, xml)).bytes };
}

/**
 * Agendador (pg_cron a cada 10 min): tenta de novo PDF oficial, Zen e Questor
 * das notas emitidas que ainda não fecharam. Para antes do tempo da função.
 */
export async function processarPendentesPdf(limite = 40, orcamentoMs = 45_000) {
  const inicio = Date.now();
  const { data } = await db().from("nfse_notas")
    .select("id,zen_documento_id,pdf_ok,pdf_origem,questor_ok,rps_serie,codigoempresa,tomador")
    .eq("status", "emitida").eq("ambiente", 1)
    .order("pdf_ultima_tentativa", { ascending: true, nullsFirst: true }).limit(200);
  const pend = (data ?? []).filter((n) =>
    !n.pdf_ok || (!n.zen_documento_id && (n.tomador as { cpf_cnpj?: string })?.cpf_cnpj)
    || (!n.questor_ok && n.codigoempresa === 725 && n.rps_serie !== SERIE_AVULSA)).slice(0, limite);
  const res = { tentadas: 0, ok: 0, pendentes: 0, erros: 0, restantes: 0 };
  for (const n of pend) {
    if (Date.now() - inicio > orcamentoMs) break;
    res.tentadas++;
    const r = await baixarEPublicar(n.id).catch(() => ({ status: "erro" as const, mensagem: "" }));
    if (r.status === "ok") res.ok++; else if (r.status === "pendente") res.pendentes++; else res.erros++;
  }
  res.restantes = pend.length - res.tentadas;
  return res;
}
