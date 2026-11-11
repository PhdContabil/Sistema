// Emissão de NFS-e da PHD dentro do Núcleo — SERVIDOR.
//
// Fluxo (o mesmo do app phd_nfse, sem .bat):
//   1. importar  — CSV do nSQL (ou, quando existir, a API do Questor) vira
//                  linhas em nfse_notas, com a validação de cada uma;
//   2. emitir    — uma nota por chamada, em ordem de RPS (a prefeitura exige a
//                  sequência). A tela chama nota a nota e espera quando a
//                  prefeitura ainda não liberou o RPS anterior;
//   3. pdf       — busca o link na prefeitura, baixa o PDF e publica no Zen.
import { createClient } from "@supabase/supabase-js";
import { dataHoraIso, linhaParaNota, textoMensagens, erroDeSequencia, competenciasParaPdf, type LinhaBruta, type NotaNfse } from "./formato";
import { emitir as emitirWs, verificar as verificarWs, linkPdf, NfseError } from "./taboao";
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
}

function paraNota(l: LinhaNfse): NotaNfse {
  return {
    rps_serie: l.rps_serie, rps_numero: l.rps_numero, data_prestacao: l.data_prestacao,
    valor: Number(l.valor), descricao: l.descricao, codigo_servico: l.codigo_servico,
    observacao: l.observacao ?? "", tomador: l.tomador,
  };
}

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
  | { ok: true; protocolo: string }
  | { ok: false; aguardar: true; ultimo: number | null; erro: string }
  | { ok: false; aguardar: false; erro: string };

/**
 * Emite UMA nota. Erro de sequência ("a prefeitura ainda não liberou o RPS
 * anterior") volta com `aguardar: true` para a tela esperar e repetir; se a
 * prefeitura já passou deste RPS, a nota provavelmente já foi emitida.
 */
export async function emitirNota(id: number, email: string): Promise<ResultadoEmissao> {
  const sb = db();
  const l = await obter(id);
  if (l.status === "emitida" || l.status === "manual") return { ok: false, aguardar: false, erro: "Esta nota já foi emitida." };
  if (l.problemas?.length) return { ok: false, aguardar: false, erro: `Corrija antes de emitir: ${l.problemas.join("; ")}` };

  // Trava contra duplo clique / duas abas: só uma chamada passa de pendente/erro para emitindo.
  const { data: preso } = await sb.from("nfse_notas").update({ status: "emitindo", atualizado_em: new Date().toISOString() })
    .eq("id", id).in("status", ["pendente", "erro"]).select("id");
  if (!preso?.length) return { ok: false, aguardar: false, erro: "Esta nota já está sendo emitida." };

  try {
    const r = await emitirWs(paraNota(l));
    if (r.retorno) {
      await sb.from("nfse_notas").update({
        status: "emitida", protocolo: r.protocolo, erro: null, emitido_por: email,
        emitido_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
      }).eq("id", id);
      return { ok: true, protocolo: r.protocolo };
    }
    const erro = textoMensagens(r) || "A prefeitura recusou sem mensagem.";
    const seq = erroDeSequencia(erro);
    if (seq.sequencia && !(seq.ultimo != null && seq.ultimo >= l.rps_numero)) {
      await sb.from("nfse_notas").update({ status: "pendente", erro: `Aguardando a prefeitura liberar a sequência (último: ${seq.ultimo ?? "?"}).` }).eq("id", id);
      return { ok: false, aguardar: true, ultimo: seq.ultimo, erro };
    }
    const msg = seq.sequencia
      ? `${erro} — A prefeitura já processou o RPS ${seq.ultimo}, igual ou maior que este: provavelmente esta nota JÁ FOI EMITIDA. Confira no portal e marque como manual.`
      : erro;
    await sb.from("nfse_notas").update({ status: "erro", erro: msg, atualizado_em: new Date().toISOString() }).eq("id", id);
    return { ok: false, aguardar: false, erro: msg };
  } catch (e) {
    const msg = e instanceof NfseError || e instanceof Error ? e.message : "Falha ao emitir.";
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

/** VERFICARPS: a prefeitura valida a nota sem emitir. Bom para o primeiro teste. */
export async function verificarNota(id: number): Promise<{ status: "ok" | "erro"; mensagem: string }> {
  const l = await obter(id);
  try {
    const r = await verificarWs(paraNota(l));
    const texto = textoMensagens(r);
    return r.retorno
      ? { status: "ok", mensagem: `RPS ${l.rps_numero}: a prefeitura aceitou o XML (nada foi emitido).${texto ? ` ${texto}` : ""}` }
      : { status: "erro", mensagem: `RPS ${l.rps_numero}: ${texto || "a prefeitura recusou sem mensagem."}` };
  } catch (e) {
    return { status: "erro", mensagem: e instanceof Error ? e.message : "Falha ao verificar." };
  }
}

/** Nota emitida no portal à mão: mantém a sequência e segue para a próxima. */
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
 * Busca o link do PDF na prefeitura (tenta a competência da prestação, a
 * anterior e a atual), baixa e publica no Zen. Pode rodar de novo: a nota
 * que a prefeitura ainda não liberou volta como "pendente".
 */
export async function baixarEPublicar(id: number): Promise<{ status: "ok" | "pendente" | "manutencao" | "erro"; mensagem: string }> {
  const sb = db();
  const l = await obter(id);
  if (l.status !== "emitida" && l.status !== "manual") return { status: "erro", mensagem: "A nota ainda não foi emitida." };

  let dados = null, manutencao = false;
  for (const [mes, ano] of competenciasParaPdf(l.data_prestacao, new Date().toISOString().slice(0, 10))) {
    const r = await linkPdf(l.rps_serie, l.rps_numero, mes, ano);
    dados = r.dados; manutencao = r.manutencao;
    if (dados?.link) break;
    if (!/n[aã]o localizada/i.test(dados?.mensagem ?? "")) break;
  }
  if (!dados?.link) {
    if (manutencao) return { status: "manutencao", mensagem: "Sistema da prefeitura em manutenção. Tente mais tarde." };
    if (/n[aã]o localizada/i.test(dados?.mensagem ?? "")) return { status: "pendente", mensagem: "A prefeitura ainda está processando. Tente de novo em alguns minutos." };
    return { status: "erro", mensagem: dados?.mensagem ?? "A prefeitura não devolveu o link do PDF." };
  }

  await sb.from("nfse_notas").update({
    link_pdf: dados.link, numero_nota: dados.numero_nota, serie_nota: dados.serie_nota,
    codigo_verificacao: dados.codigo_verificacao, data_emissao: dados.data_emissao, atualizado_em: new Date().toISOString(),
  }).eq("id", id);

  const pdf = await fetch(dados.link, { cache: "no-store", signal: AbortSignal.timeout(45_000) }).then((r) => r.arrayBuffer()).catch(() => null);
  const bytes = pdf ? Buffer.from(pdf) : null;
  if (!bytes || bytes.subarray(0, 4).toString() !== "%PDF") {
    return { status: "erro", mensagem: "O link da prefeitura não devolveu um PDF (manutenção?). Tente de novo." };
  }
  await sb.from("nfse_notas").update({ pdf_ok: true }).eq("id", id);

  // Número da NFS-e de volta no RPS do Questor (não trava o resto se falhar).
  if (dados.numero_nota && dados.codigo_verificacao && !(l as LinhaNfse & { questor_ok?: boolean }).questor_ok) {
    try {
      const r = await gravarNfseNoQuestor(l.rps_serie, l.rps_numero, {
        usuario: "nucleo-financeiro", numero_nfse: dados.numero_nota, serie_nfse: dados.serie_nota,
        codigo_verificacao: dados.codigo_verificacao, data_emissao: dataHoraIso(dados.data_emissao),
      }, { dryRun: false, idempotencyKey: `nucleo-nfse-${l.rps_serie}-${l.rps_numero}-${dados.numero_nota}` });
      await sb.from("nfse_notas").update(r.ok
        ? { questor_ok: true, questor_erro: null }
        : { questor_erro: `HTTP ${r.status}: ${JSON.stringify(r.corpo.detail ?? r.corpo.erro ?? "").slice(0, 300)}` }).eq("id", id);
    } catch (e) {
      await sb.from("nfse_notas").update({ questor_erro: e instanceof Error ? e.message : "falha" }).eq("id", id);
    }
  }

  if (l.zen_documento_id) return { status: "ok", mensagem: `NFS-e ${dados.numero_nota}: PDF ok, já estava no Zen.` };
  if (!hasQuestorZenToken()) return { status: "ok", mensagem: `NFS-e ${dados.numero_nota}: PDF ok. Zen não configurado.` };
  try {
    const cliente = await consultarCliente(l.tomador.cpf_cnpj);
    const nome = nomePdf(dados.numero_nota ?? String(l.rps_numero), l.tomador.razao_social);
    const arquivo = await uploadArquivo(nome, bytes);
    const [a, m, d] = l.data_prestacao.split("-");
    const doc = await importarDocumento({
      codigoCategoria: CATEGORIA_ZEN_NFSE,
      codigoCliente: cliente.CodigoCliente,
      codigoArquivo: arquivo,
      titulo: `NFS-e ${dados.numero_nota} - ${l.tomador.razao_social.slice(0, 50)}`,
      observacao: `NFS-e emitida pelo Núcleo Contábil. RPS ${l.rps_serie}-${l.rps_numero}`,
      dataCompetencia: `${d}/${m}/${a}`,
      dataPublicacao: dados.data_emissao ?? undefined,
      valor: Number(l.valor).toFixed(2),
    });
    await sb.from("nfse_notas").update({ zen_documento_id: doc, zen_erro: null }).eq("id", id);
    return { status: "ok", mensagem: `NFS-e ${dados.numero_nota} publicada no Zen.` };
  } catch (e) {
    const msg = e instanceof ClienteNaoEncontradoError
      ? "Cliente não cadastrado no Zen (CRM > Clientes)."
      : e instanceof Error ? e.message : "Falha no Zen.";
    await sb.from("nfse_notas").update({ zen_erro: msg }).eq("id", id);
    return { status: "ok", mensagem: `NFS-e ${dados.numero_nota}: PDF ok, mas não subiu para o Zen: ${msg}` };
  }
}
