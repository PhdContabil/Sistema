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
import { emitirNacional, consultarNfse, ibgePorCep, certificado, config, ambiente, NacionalError } from "./nacional";
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
  id: number; rps_serie: string; rps_numero: number; origem: string; arquivo: string | null;
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
export async function importar(linhas: LinhaBruta[], origem: "csv" | "questor", arquivo: string | null, email: string, dataManual?: string | null) {
  const sb = db();
  // Data de prestação/competência informada na tela (exceção do mês atual) vale para todas as RPS do lote.
  const manual = dataManual && /^\d{4}-\d{2}-\d{2}$/.test(dataManual) ? dataManual : null;
  const notas = linhas.map((l) => linhaParaNota(l)).filter((x) => x.nota.rps_numero > 0)
    .map((x) => (manual ? { ...x, nota: { ...x.nota, data_prestacao: manual } } : x));
  const numeros = notas.map((x) => x.nota.rps_numero);
  const { data: existentes } = await sb.from("nfse_notas").select("rps_serie,rps_numero,status").in("rps_numero", numeros.length ? numeros : [0]);
  const travadas = new Set((existentes ?? []).filter((e) => ["emitida", "manual", "emitindo"].includes(e.status)).map((e) => `${e.rps_serie}-${e.rps_numero}`));

  const novas = notas.filter((x) => !travadas.has(`${x.nota.rps_serie}-${x.nota.rps_numero}`)).map(({ nota, problemas }) => ({
    rps_serie: nota.rps_serie, rps_numero: nota.rps_numero, origem, arquivo,
    data_prestacao: nota.data_prestacao, valor: nota.valor, descricao: nota.descricao,
    codigo_servico: nota.codigo_servico, observacao: nota.observacao || null, tomador: nota.tomador,
    problemas, status: "pendente", erro: null, importado_por: email, atualizado_em: new Date().toISOString(),
  }));
  if (novas.length) {
    const { error } = await sb.from("nfse_notas").upsert(novas, { onConflict: "rps_serie,rps_numero" });
    if (error) throw new Error(error.message);
  }
  return {
    lidas: linhas.length, gravadas: novas.length, jaEmitidas: notas.length - novas.length,
    comProblema: novas.filter((n) => n.problemas.length).length,
  };
}

export async function listar(filtro: { status?: string; de?: number; ate?: number }) {
  let q = db().from("nfse_notas").select("*").order("rps_numero", { ascending: false }).limit(500);
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

  const nota = await paraNac(l);
  const prob = validarNac(nota, hojeBR());
  if (prob.length) return { ok: false, aguardar: false, erro: prob.join("; ") };

  // Trava contra duplo clique / duas abas.
  const { data: preso } = await sb.from("nfse_notas").update({ status: "emitindo", atualizado_em: new Date().toISOString() })
    .eq("id", id).in("status", ["pendente", "erro"]).select("id");
  if (!preso?.length) return { ok: false, aguardar: false, erro: "Esta nota já está sendo emitida." };

  try {
    const r = await emitirNacional(nota);
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
      ambiente: ambiente(), emitido_por: email, emitido_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
    }).eq("id", id);
    const pos = await baixarEPublicar(id).catch((e) => ({ status: "erro" as const, mensagem: e instanceof Error ? e.message : "falha" }));
    return { ok: true, protocolo: r.chave, numero: r.nNFSe, pdf: pos.mensagem };
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
    const nota = await paraNac(l);
    const prob = [...(l.problemas ?? []), ...validarNac(nota, hojeBR())];
    const cfg = config();
    if (!(cfg.pTotTribSN > 0)) prob.push("Falta NFSE_PTOT_TRIB_SN na Vercel");
    const c = certificado();
    if (c.validade.getTime() < Date.now()) prob.push("Certificado A1 vencido");
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
export async function baixarEPublicar(id: number): Promise<{ status: "ok" | "pendente" | "erro"; mensagem: string }> {
  const sb = db();
  const l = await obter(id);
  if (l.status !== "emitida") return { status: "erro", mensagem: "Só há PDF para notas emitidas pelo Núcleo (as manuais ficam no Portal Nacional)." };
  if (!l.chave_acesso) return { status: "erro", mensagem: "A nota não tem chave de acesso." };

  let xml = l.nfse_xml;
  if (!xml) {
    xml = await consultarNfse(l.chave_acesso);
    if (!xml) return { status: "pendente", mensagem: "A Sefin ainda não devolveu o XML da NFS-e. Tente de novo em alguns minutos." };
    await sb.from("nfse_notas").update({ nfse_xml: xml }).eq("id", id);
  }
  const bytes = await gerarDanfse(xml, l.chave_acesso, l.ambiente ?? ambiente());
  await sb.from("nfse_notas").update({ pdf_ok: true, atualizado_em: new Date().toISOString() }).eq("id", id);
  const numero = l.numero_nota ?? String(l.rps_numero);

  // Número da NFS-e de volta no RPS do Questor (só em produção; não trava o resto).
  if ((l.ambiente ?? ambiente()) === 1 && l.numero_nota && !l.questor_ok) {
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

  if (l.zen_documento_id) return { status: "ok", mensagem: `NFS-e ${numero}: PDF ok, já estava no Zen.` };
  if ((l.ambiente ?? ambiente()) !== 1) return { status: "ok", mensagem: `NFS-e ${numero}: PDF ok (teste — não vai para o Zen).` };
  if (!hasQuestorZenToken()) return { status: "ok", mensagem: `NFS-e ${numero}: PDF ok. Zen não configurado.` };
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

/** PDF da nota para abrir/baixar na tela. */
export async function pdfDaNota(id: number): Promise<{ nome: string; bytes: Buffer }> {
  const l = await obter(id);
  if (!l.chave_acesso) throw new Error("Nota sem chave de acesso.");
  const xml = l.nfse_xml ?? (await consultarNfse(l.chave_acesso));
  if (!xml) throw new Error("XML da NFS-e ainda indisponível.");
  return { nome: nomePdf(l.numero_nota ?? String(l.rps_numero), l.tomador.razao_social), bytes: await gerarDanfse(xml, l.chave_acesso, l.ambiente ?? ambiente()) };
}
