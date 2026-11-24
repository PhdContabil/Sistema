// NFS-e do MEI direto pela API do Portal Nacional (Sefin), no lugar do robô
// que preenchia o Emissor Nacional no Chrome — SERVIDOR.
//
// Autenticação e assinatura com o certificado A1 da PHD (o mesmo do Financeiro,
// tabela nfse_empresas, empresa 725). O prestador da DPS é o MEI: a PHD emite
// "representando" o MEI pela procuração eletrônica que ele deu à PHD no Emissor
// Nacional (regra da Receita de 23/11/2026 — dispensa o certificado do cliente).
//
// O número da DPS é controlado aqui, por CNPJ do MEI (tabela mei_nfse). O número
// da NFS-e quem dá é a Sefin; ele volta na resposta e vai para o lançamento no Questor.
import { createClient } from "@supabase/supabase-js";
import { carregarEmpresa } from "@/lib/nfse/empresas";
import { emitirNacional, prepararDps, ibgePorCep, baixarDanfseOficial, NacionalError } from "@/lib/nfse/nacional";
import { gerarDanfse } from "@/lib/nfse/danfse";
import type { ConfigNacional, NotaNac, TomadorNac } from "@/lib/nfse/nacional-formato";
import { listaMEI, AVULSO_SALAO } from "@/lib/mei/questor-mei";

/** Empresa do Financeiro cujo certificado A1 assina as notas dos MEI (PHD CONTABIL LTDA). */
export const EMPRESA_CERT_PHD = 725;
const SERIE_DPS = "1";
const DISCRIMINACAO_PADRAO = "NOTA PELO PRESTADOR. Serviços prestados de beleza, conforme resolução CGSN nº 140 de 22 de maio de 2018, cota parte profissional parceiro.";

/** Códigos de tributação nacional (LC 116, item + subitem + desdobro) usados pelos MEI de salão. */
export const SERVICOS_MEI: { cTribNac: string; descricao: string }[] = [
  { cTribNac: "060101", descricao: "06.01.01 — Barbearia, cabeleireiros, manicuros, pedicuros e congêneres" },
  { cTribNac: "060201", descricao: "06.02.01 — Esteticistas, tratamento de pele, depilação e congêneres" },
  { cTribNac: "060301", descricao: "06.03.01 — Banhos, duchas, sauna, massagens e congêneres" },
];

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Banco indisponível.");
  return createClient(url, key, { auth: { persistSession: false } });
}

const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
export const ambienteMei = (): 1 | 2 => (process.env.MEI_NFSE_AMBIENTE === "homologacao" ? 2 : 1);

/**
 * Código nacional a partir da atividade municipal do Questor ("00601 - Barbearia…",
 * "00000601 - …", "8516 - Estética…"). Sem certeza, devolve "" e a tela pede para escolher.
 */
export function cTribNacDaAtividade(ativ: string): string {
  const [cod, ...resto] = String(ativ ?? "").split(" - ");
  const desc = resto.join(" ").toLowerCase();
  const n = dig(cod).replace(/^0+/, "");
  if (/^60[1-3]$/.test(n)) return `0${n}01`;
  if (/barb|cabele|manicur|pedicur|unha|sobrancel|maqui/.test(desc)) return "060101";
  if (/est[eé]tic|pele|depila/.test(desc)) return "060201";
  if (/massag|sauna|ducha|banho/.test(desc)) return "060301";
  return "";
}

/** Endereço público do CNPJ (BrasilAPI) para o grupo <toma>. Falhou: vai sem endereço. */
async function tomadorPorCnpj(cnpj: string, nomePadrao: string): Promise<TomadorNac> {
  const base: TomadorNac = { cpf_cnpj: cnpj, razao_social: nomePadrao, inscricao_municipal: "", email: "", tipo_logradouro: "", logradouro: "", numero: "", complemento: "", bairro: "", cep: "", ibge: "" };
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return base;
    const j = (await r.json()) as Record<string, unknown>;
    const s = (k: string) => String(j[k] ?? "").trim();
    return {
      ...base,
      razao_social: s("razao_social") || nomePadrao,
      tipo_logradouro: s("descricao_tipo_de_logradouro"), logradouro: s("logradouro"), numero: s("numero"),
      complemento: s("complemento"), bairro: s("bairro"), cep: dig(s("cep")), ibge: dig(s("codigo_municipio_ibge")),
    };
  } catch {
    return base;
  }
}

export interface PedidoNotaMei {
  cod: number;
  data: string;            // competência AAAA-MM-DD
  valor: number;
  descricao?: string;
  cTribNac?: string;
  tomadorModo: "salao" | "sem" | "outro";
  tomadorDoc?: string | null;
  tomadorNome?: string | null;
  idem: string;            // chave única do clique (evita nota em dobro)
  simular?: boolean;       // monta e assina, não envia
}

export type RespostaNotaMei =
  | { ok: true; simulacao: true; prestador: string; tomador: string | null; cTribNac: string; ambiente: number; idDps: string; xml: string }
  | { ok: true; simulacao?: false; ja_emitida?: boolean; chave: string; numero: string | null; serie: string; dhProc: string | null; ambiente: number }
  | { ok: false; erro: string; codigos?: string[] };

/** Monta tudo o que a DPS precisa a partir do cadastro do MEI no Questor. */
async function montar(p: PedidoNotaMei) {
  const m = (await listaMEI()).find((x) => x.cod === Number(p.cod));
  if (!m) throw new NacionalError(`MEI ${p.cod} não encontrado.`);
  if (m.bloqueado) throw new NacionalError("Empresa BLOQUEADA: emissão desabilitada.");
  const cnpj = dig(m.cnpj);
  if (cnpj.length !== 14) throw new NacionalError("CNPJ do MEI inválido no cadastro.");
  if (m.fim && p.data > String(m.fim).slice(0, 10) && String(m.fim).slice(0, 4) < "2100") throw new NacionalError(`Profissional baixado em ${String(m.fim).slice(0, 10).split("-").reverse().join("/")}: a nota só pode ter data até a baixa.`);
  const ibge = (await ibgePorCep(m.cep)) ?? "";
  if (ibge.length !== 7) throw new NacionalError(`Não achei o município (IBGE) pelo CEP do MEI (${m.cep || "vazio"}). Confira o CEP no cadastro.`);
  const cTribNac = dig(p.cTribNac) || cTribNacDaAtividade(m.ativMunic);
  if (cTribNac.length !== 6) throw new NacionalError("Escolha o serviço (código de tributação nacional).");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.data)) throw new NacionalError("Data inválida.");
  if (p.data > hojeBR()) throw new NacionalError("A data da nota não pode ser futura.");
  const valor = Math.round(Number(p.valor) * 100) / 100;
  if (!(valor > 0)) throw new NacionalError("Valor inválido.");

  let tomador: TomadorNac | null = null;
  if (p.tomadorModo === "salao") {
    const doc = dig(m.salaoCnpj);
    if (m.salaoCod === AVULSO_SALAO || /^5+$/.test(doc) || !doc) tomador = null; // avulso: consumidor não identificado
    else if (doc.length === 14) tomador = await tomadorPorCnpj(doc, m.salao);
    else throw new NacionalError("CNPJ do salão inválido no cadastro — escolha \"Outro\" ou \"Sem tomador\".");
  } else if (p.tomadorModo === "outro") {
    const doc = dig(p.tomadorDoc);
    if (doc.length === 14) tomador = await tomadorPorCnpj(doc, String(p.tomadorNome ?? "").trim());
    else if (doc.length === 11) {
      const nome = String(p.tomadorNome ?? "").trim();
      if (!nome) throw new NacionalError("Informe o nome do tomador (CPF).");
      tomador = { cpf_cnpj: doc, razao_social: nome, inscricao_municipal: "", email: "", tipo_logradouro: "", logradouro: "", numero: "", complemento: "", bairro: "", cep: "", ibge: "" };
    } else throw new NacionalError("Tomador: CPF (11 números) ou CNPJ (14 números).");
    if (!tomador.razao_social) throw new NacionalError("Não achei o nome do tomador — digite o nome.");
  }
  if (tomador && dig(tomador.cpf_cnpj) === cnpj) throw new NacionalError("Tomador igual ao prestador.");

  const cfg: ConfigNacional = {
    ambiente: ambienteMei(), cnpj, im: "", cLocEmi: ibge, serie: SERIE_DPS, cTribNac, cNBS: "",
    opSimpNac: 2, pTotTribSN: 0, verAplic: "NucleoMEI1",
  };
  const vazio: TomadorNac = { cpf_cnpj: "", razao_social: "", inscricao_municipal: "", email: "", tipo_logradouro: "", logradouro: "", numero: "", complemento: "", bairro: "", cep: "", ibge: "" };
  const nota: Omit<NotaNac, "nDPS"> = {
    dCompet: p.data, valor, descricao: String(p.descricao ?? "").trim() || DISCRIMINACAO_PADRAO, infoCompl: "",
    tomador: tomador ?? vazio,
  };
  return { m, cnpj, cfg, nota, tomador };
}

export async function emitirNotaMei(p: PedidoNotaMei, email: string): Promise<RespostaNotaMei> {
  let base: Awaited<ReturnType<typeof montar>>;
  let cert: Awaited<ReturnType<typeof carregarEmpresa>>["cert"];
  try {
    base = await montar(p);
    cert = (await carregarEmpresa(EMPRESA_CERT_PHD)).cert;
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao preparar a nota." };
  }
  const { m, cnpj, cfg, nota, tomador } = base;
  const tomTxt = tomador ? `${tomador.razao_social} (${tomador.cpf_cnpj})` : null;

  if (p.simular) {
    try {
      const { id, xml } = prepararDps({ ...nota, nDPS: 1 }, cfg, cert, { procuracao: true });
      return { ok: true, simulacao: true, prestador: `${m.razao} (${cnpj})`, tomador: tomTxt, cTribNac: cfg.cTribNac, ambiente: cfg.ambiente, idDps: id, xml };
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : "Falha ao montar a DPS." };
    }
  }

  const sb = db();
  const idem = String(p.idem ?? "").slice(0, 120);
  if (!idem) return { ok: false, erro: "Falta a chave de idempotência." };
  const { data: ja } = await sb.from("mei_nfse").select("status,chave_acesso,nnfse,serie_dps,dh_proc,ambiente").eq("idem", idem).maybeSingle();
  if (ja?.status === "emitida") return { ok: true, ja_emitida: true, chave: ja.chave_acesso, numero: ja.nnfse, serie: ja.serie_dps, dhProc: ja.dh_proc, ambiente: ja.ambiente };
  if (ja) return { ok: false, erro: "Esta nota já está sendo emitida (ou ficou sem resposta). Confira no portal antes de tentar de novo." };

  // Reserva o número da DPS (único por CNPJ + série + ambiente) e envia; E0014 = número já usado → próximo.
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const { data: ult } = await sb.from("mei_nfse").select("ndps").eq("cnpj", cnpj).eq("serie_dps", SERIE_DPS).eq("ambiente", cfg.ambiente)
      .order("ndps", { ascending: false }).limit(1);
    const nDPS = Number(ult?.[0]?.ndps ?? 0) + 1;
    const { data: linha, error } = await sb.from("mei_nfse").insert({
      codigoempresa: m.cod, cnpj, serie_dps: SERIE_DPS, ndps: nDPS, ambiente: cfg.ambiente, status: "emitindo", idem,
      dcompet: nota.dCompet, valor: nota.valor, tomador_doc: tomador?.cpf_cnpj ?? null, tomador_nome: tomador?.razao_social ?? null,
      ctribnac: cfg.cTribNac, descricao: nota.descricao, emitido_por: email,
    }).select("id").single();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        if (/idem/i.test(error.message)) return { ok: false, erro: "Esta nota já está sendo emitida." };
        continue;
      }
      return { ok: false, erro: `Banco: ${error.message}` };
    }
    const agora = () => new Date().toISOString();
    let r: Awaited<ReturnType<typeof emitirNacional>>;
    try {
      r = await emitirNacional({ ...nota, nDPS }, cfg, cert, { procuracao: true });
    } catch (e) {
      // Sem resposta: não dá para saber se a Sefin gerou a nota. A linha fica "incerta" (o número não é reutilizado).
      const msg = e instanceof Error ? e.message : "Falha ao falar com a Sefin.";
      await sb.from("mei_nfse").update({ status: "incerta", idem: null, erro: msg, atualizado_em: agora() }).eq("id", linha.id);
      return { ok: false, erro: `${msg} Confira no Emissor Nacional se a nota saiu antes de emitir de novo.` };
    }
    if (r.ok) {
      await sb.from("mei_nfse").update({
        status: "emitida", chave_acesso: r.chave, nnfse: r.nNFSe, dh_proc: r.dhProc, nfse_xml: r.nfseXml, dps_xml: r.dpsXml, erro: null, atualizado_em: agora(),
      }).eq("id", linha.id);
      return { ok: true, chave: r.chave, numero: r.nNFSe, serie: SERIE_DPS, dhProc: r.dhProc, ambiente: cfg.ambiente };
    }
    if (r.codigos.includes("E0014")) {
      await sb.from("mei_nfse").update({ status: "numero_usado", idem: null, erro: r.erro, codigos: r.codigos, atualizado_em: agora() }).eq("id", linha.id);
      continue;
    }
    // Recusa definitiva: a nota não existe; libera o número e a chave para corrigir e tentar de novo.
    await sb.from("mei_nfse").delete().eq("id", linha.id);
    return { ok: false, erro: traduzir(r.erro, r.codigos), codigos: r.codigos };
  }
  return { ok: false, erro: "Não achei um número de DPS livre depois de 8 tentativas. Avise a T.I." };
}

/** Mensagens mais claras para os erros que dependem da procuração. */
function traduzir(erro: string, codigos: string[]): string {
  if (/procura|represent|autoriza|E1235|E1229|certificado/i.test(erro)) {
    return `${erro} — Possível falta de procuração eletrônica do MEI para a PHD no Emissor Nacional.`;
  }
  void codigos;
  return erro;
}

/** Notas emitidas pelo Núcleo para um MEI (mais recentes primeiro). */
export async function notasEmitidasMei(cod: number) {
  const { data } = await db().from("mei_nfse").select("id,dcompet,valor,nnfse,chave_acesso,status,tomador_nome,emitido_por,criado_em,ambiente")
    .eq("codigoempresa", cod).in("status", ["emitida", "incerta"]).order("criado_em", { ascending: false }).limit(20);
  return data ?? [];
}

/** PDF da nota: DANFSe oficial do ADN (com o certificado da PHD) ou, se o serviço falhar, gerado do XML. */
export async function pdfNotaMei(chave: string): Promise<Buffer> {
  const { data } = await db().from("mei_nfse").select("nfse_xml,ambiente").eq("chave_acesso", chave).maybeSingle();
  if (!data) throw new NacionalError("Nota não encontrada no Núcleo.");
  const amb = data.ambiente === 1 ? 1 : 2;
  const { cert } = await carregarEmpresa(EMPRESA_CERT_PHD);
  const of = await baixarDanfseOficial(chave, amb, cert);
  if (of.pdf) return of.pdf;
  if (!data.nfse_xml) throw new NacionalError(`PDF oficial indisponível (${of.motivo}).`);
  return gerarDanfse(data.nfse_xml, chave, amb);
}
