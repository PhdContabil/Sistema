// NFS-e de CLIENTES emitida pela API do Portal Nacional com o certificado A1
// da PHD + procuração eletrônica do cliente no Emissor Nacional — SERVIDOR.
// Usado pelo Sistema MEI (lib/mei/nfse-mei.ts) e pelo Fiscal (lib/fiscal/nfse-fiscal.ts).
//
// Regra da Receita de 23/11/2026: a contabilidade autentica e assina com o próprio
// certificado e emite tendo o cliente como prestador (sem o certificado do cliente).
// O número da DPS é controlado aqui por CNPJ (tabela mei_nfse, campo origem);
// o número da NFS-e quem dá é a Sefin.
import { createClient } from "@supabase/supabase-js";
import { carregarEmpresa } from "./empresas";
import { emitirNacional, prepararDps, baixarDanfseOficial, NacionalError } from "./nacional";
import { gerarDanfse } from "./danfse";
import type { ConfigNacional, NotaNac, TomadorNac } from "./nacional-formato";

/** Empresa do Financeiro cujo certificado A1 assina as notas dos clientes (PHD CONTABIL LTDA). */
export const EMPRESA_CERT_PHD = 725;
export const SERIE_DPS = "1";

export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Banco indisponível.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
export const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
export const TOMADOR_VAZIO: TomadorNac = { cpf_cnpj: "", razao_social: "", inscricao_municipal: "", email: "", tipo_logradouro: "", logradouro: "", numero: "", complemento: "", bairro: "", cep: "", ibge: "" };

const UA = { "User-Agent": "Mozilla/5.0 (NucleoContabil)", Accept: "application/json" };

/** Nome e endereço públicos do CNPJ (BrasilAPI; reserva: publica.cnpj.ws) para o grupo <toma>. Falhou: vai sem endereço. */
export async function tomadorPorCnpj(cnpj: string, nomePadrao: string): Promise<TomadorNac> {
  const base: TomadorNac = { ...TOMADOR_VAZIO, cpf_cnpj: cnpj, razao_social: nomePadrao };
  const t = (v: unknown) => String(v ?? "").trim();
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { headers: UA, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const j = r.ok ? ((await r.json()) as Record<string, unknown>) : null;
    // BrasilAPI às vezes vem sem logradouro: aí usa a reserva.
    if (j && t(j.logradouro)) {
      return {
        ...base, razao_social: t(j.razao_social) || nomePadrao,
        tipo_logradouro: t(j.descricao_tipo_de_logradouro), logradouro: t(j.logradouro), numero: t(j.numero),
        complemento: t(j.complemento), bairro: t(j.bairro), cep: dig(j.cep), ibge: dig(j.codigo_municipio_ibge),
      };
    }
  } catch { /* tenta a reserva */ }
  try {
    const r = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, { headers: UA, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (r.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const j = (await r.json()) as any;
      const e = j.estabelecimento ?? {};
      return {
        ...base, razao_social: t(j.razao_social) || nomePadrao,
        tipo_logradouro: t(e.tipo_logradouro), logradouro: t(e.logradouro), numero: t(e.numero),
        complemento: t(e.complemento), bairro: t(e.bairro), cep: dig(e.cep), ibge: dig(e.cidade?.ibge_id),
      };
    }
  } catch { /* sem dados públicos */ }
  return base;
}

/** Tomador digitado (CPF/CNPJ + nome). Sem documento = sem tomador. */
export async function tomadorDigitado(doc: string | null | undefined, nome: string | null | undefined): Promise<TomadorNac | null> {
  const d = dig(doc);
  if (!d) return null;
  if (d.length === 14) {
    const t = await tomadorPorCnpj(d, String(nome ?? "").trim());
    if (!t.razao_social) throw new NacionalError("Não achei o nome do tomador na Receita — digite o nome.");
    return t;
  }
  if (d.length === 11) {
    const n = String(nome ?? "").trim();
    if (!n) throw new NacionalError("Informe o nome do tomador (CPF).");
    return { ...TOMADOR_VAZIO, cpf_cnpj: d, razao_social: n };
  }
  throw new NacionalError("Tomador: CPF (11 números) ou CNPJ (14 números).");
}

export type RespostaProcuracao =
  | { ok: true; simulacao: true; prestador: string; tomador: string | null; cTribNac: string; ambiente: number; idDps: string; xml: string }
  | { ok: true; simulacao?: false; ja_emitida?: boolean; id: number; chave: string; numero: string | null; serie: string; dhProc: string | null; ambiente: number }
  | { ok: false; erro: string; codigos?: string[] };

export interface EmissaoProcuracao {
  origem: "mei" | "fiscal";
  codigoempresa: number;
  nome: string;
  cfg: ConfigNacional;
  nota: Omit<NotaNac, "nDPS">;
  tomador: TomadorNac | null;
  idem: string;
  email: string;
  simular?: boolean;
}

/** Reserva o número da DPS, assina com o certificado da PHD e envia. */
export async function emitirPorProcuracao(e: EmissaoProcuracao): Promise<RespostaProcuracao> {
  const { cfg, nota, tomador } = e;
  if (tomador && dig(tomador.cpf_cnpj) === cfg.cnpj) return { ok: false, erro: "Tomador igual ao prestador." };
  let cert: Awaited<ReturnType<typeof carregarEmpresa>>["cert"];
  try { cert = (await carregarEmpresa(EMPRESA_CERT_PHD)).cert; }
  catch (x) { return { ok: false, erro: x instanceof Error ? x.message : "Certificado da PHD indisponível." }; }
  const tomTxt = tomador ? `${tomador.razao_social} (${tomador.cpf_cnpj})` : null;
  const notaFinal = { ...nota, tomador: tomador ?? TOMADOR_VAZIO };

  if (e.simular) {
    try {
      const { id, xml } = prepararDps({ ...notaFinal, nDPS: 1 }, cfg, cert, { procuracao: true });
      return { ok: true, simulacao: true, prestador: `${e.nome} (${cfg.cnpj})`, tomador: tomTxt, cTribNac: cfg.cTribNac, ambiente: cfg.ambiente, idDps: id, xml };
    } catch (x) {
      return { ok: false, erro: x instanceof Error ? x.message : "Falha ao montar a DPS." };
    }
  }

  const sb = db();
  const idem = String(e.idem ?? "").slice(0, 120);
  if (!idem) return { ok: false, erro: "Falta a chave de idempotência." };
  const { data: ja } = await sb.from("mei_nfse").select("id,status,chave_acesso,nnfse,serie_dps,dh_proc,ambiente").eq("idem", idem).maybeSingle();
  if (ja?.status === "emitida") return { ok: true, ja_emitida: true, id: ja.id, chave: ja.chave_acesso, numero: ja.nnfse, serie: ja.serie_dps, dhProc: ja.dh_proc, ambiente: ja.ambiente };
  if (ja) return { ok: false, erro: "Esta nota já está sendo emitida (ou ficou sem resposta). Confira no portal antes de tentar de novo." };

  // Número da DPS único por CNPJ + série + ambiente; E0014 = número já usado → próximo.
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const { data: ult } = await sb.from("mei_nfse").select("ndps").eq("cnpj", cfg.cnpj).eq("serie_dps", cfg.serie).eq("ambiente", cfg.ambiente)
      .order("ndps", { ascending: false }).limit(1);
    const nDPS = Number(ult?.[0]?.ndps ?? 0) + 1;
    const { data: linha, error } = await sb.from("mei_nfse").insert({
      origem: e.origem, codigoempresa: e.codigoempresa, cnpj: cfg.cnpj, serie_dps: cfg.serie, ndps: nDPS, ambiente: cfg.ambiente, status: "emitindo", idem,
      dcompet: nota.dCompet, valor: nota.valor, tomador_doc: tomador?.cpf_cnpj ?? null, tomador_nome: tomador?.razao_social ?? null,
      ctribnac: cfg.cTribNac, descricao: nota.descricao, emitido_por: e.email,
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
      r = await emitirNacional({ ...notaFinal, nDPS }, cfg, cert, { procuracao: true });
    } catch (x) {
      // Sem resposta: não dá para saber se a Sefin gerou a nota. A linha fica "incerta" (o número não é reutilizado).
      const msg = x instanceof Error ? x.message : "Falha ao falar com a Sefin.";
      await sb.from("mei_nfse").update({ status: "incerta", idem: null, erro: msg, atualizado_em: agora() }).eq("id", linha.id);
      return { ok: false, erro: `${msg} Confira no Emissor Nacional se a nota saiu antes de emitir de novo.` };
    }
    if (r.ok) {
      await sb.from("mei_nfse").update({
        status: "emitida", chave_acesso: r.chave, nnfse: r.nNFSe, dh_proc: r.dhProc, nfse_xml: r.nfseXml, dps_xml: r.dpsXml, erro: null, atualizado_em: agora(),
      }).eq("id", linha.id);
      return { ok: true, id: linha.id, chave: r.chave, numero: r.nNFSe, serie: cfg.serie, dhProc: r.dhProc, ambiente: cfg.ambiente };
    }
    if (r.codigos.includes("E0014")) {
      await sb.from("mei_nfse").update({ status: "numero_usado", idem: null, erro: r.erro, codigos: r.codigos, atualizado_em: agora() }).eq("id", linha.id);
      continue;
    }
    // Recusa definitiva: a nota não existe; libera o número e a chave para corrigir e tentar de novo.
    await sb.from("mei_nfse").delete().eq("id", linha.id);
    const dica = /procura|represent|autoriza|certificado/i.test(r.erro) ? " — Possível falta de procuração eletrônica do cliente para a PHD no Emissor Nacional." : "";
    return { ok: false, erro: r.erro + dica, codigos: r.codigos };
  }
  return { ok: false, erro: "Não achei um número de DPS livre depois de 8 tentativas. Avise a T.I." };
}

/** Guarda o motivo de o Portal não ter entregue o DANFSe oficial (diagnóstico). */
export async function registrarFalhaDanfse(chave: string, motivo: string) {
  try { await db().from("nfse_danfse_log").insert({ chave, motivo: String(motivo).slice(0, 2000) }); } catch { /* só diagnóstico */ }
}

/** PDF da nota: DANFSe oficial do ADN (com o certificado da PHD) ou, se o serviço falhar, gerado do XML. */
export async function pdfPorChave(chave: string): Promise<Buffer> {
  const { data } = await db().from("mei_nfse").select("nfse_xml,ambiente").eq("chave_acesso", chave).maybeSingle();
  if (!data) throw new NacionalError("Nota não encontrada no Núcleo.");
  const amb = data.ambiente === 1 ? 1 : 2;
  const { cert } = await carregarEmpresa(EMPRESA_CERT_PHD);
  const of = await baixarDanfseOficial(chave, amb, cert);
  if (of.pdf) return of.pdf;
  await registrarFalhaDanfse(chave, of.motivo);
  if (!data.nfse_xml) throw new NacionalError(`PDF oficial indisponível (${of.motivo}).`);
  return gerarDanfse(data.nfse_xml, chave, amb);
}
