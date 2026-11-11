// Empresas emissoras de NFS-e (PHD Contábil, PHD Digital, PHD Negócios) e o
// certificado A1 de cada uma — SERVIDOR.
//
// O certificado é enviado pela tela (Financeiro › Emissão NFS-e › Configuração)
// e fica no banco CIFRADO (AES-256-GCM). A chave de cifra sai de um segredo que
// só existe no servidor (NFSE_CERT_KEY, se definido; senão a service role do
// Supabase), então o conteúdo da tabela sozinho não abre o certificado.
// O .pfx e a senha nunca voltam para o navegador: a tela só recebe titular,
// CNPJ e validade.
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { abrirPfx, NacionalError, type Cert } from "./nacional";
import type { ConfigNacional } from "./nacional-formato";

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Banco indisponível.");
  return createClient(url, key, { auth: { persistSession: false } });
}

let chaveCache: Buffer | null = null;
function chave(): Buffer {
  if (chaveCache) return chaveCache;
  const base = process.env.NFSE_CERT_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("Sem segredo do servidor para cifrar o certificado.");
  chaveCache = crypto.scryptSync(base, "nucleo-nfse-certificados-v1", 32);
  return chaveCache;
}

export function cifrar(dados: Buffer): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", chave(), iv);
  const enc = Buffer.concat([c.update(dados), c.final()]);
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

export function decifrar(texto: string): Buffer {
  const [v, iv, tag, enc] = texto.split(":");
  if (v !== "v1") throw new Error("Formato de certificado desconhecido.");
  const d = crypto.createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]);
}

const CAMPOS = "codigoempresa,nome,cnpj,im,c_loc_emi,serie,c_trib_nac,c_nbs,op_simp_nac,p_tot_trib_sn,ambiente,cert_validade,cert_cnpj,cert_titular,cert_enviado_por,cert_enviado_em";

/** O que a tela vê: configuração e situação do certificado, sem segredo. */
export interface EmpresaNfse {
  codigoempresa: number; nome: string; cnpj: string; im: string; c_loc_emi: string; serie: string;
  c_trib_nac: string; c_nbs: string; op_simp_nac: 1 | 2 | 3; p_tot_trib_sn: number | null;
  ambiente: "producao" | "homologacao";
  cert_validade: string | null; cert_cnpj: string | null; cert_titular: string | null;
  cert_enviado_por: string | null; cert_enviado_em: string | null;
}

export async function listarEmpresas(): Promise<EmpresaNfse[]> {
  const { data, error } = await sb().from("nfse_empresas").select(CAMPOS).order("codigoempresa", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as EmpresaNfse[]).sort((a, b) => (a.codigoempresa === 725 ? -1 : b.codigoempresa === 725 ? 1 : a.nome.localeCompare(b.nome)));
}

export function paraConfig(e: EmpresaNfse): ConfigNacional {
  return {
    ambiente: e.ambiente === "producao" ? 1 : 2,
    cnpj: e.cnpj, im: e.im, cLocEmi: e.c_loc_emi, serie: e.serie || "1",
    cTribNac: e.c_trib_nac, cNBS: e.c_nbs, opSimpNac: e.op_simp_nac,
    pTotTribSN: Number(e.p_tot_trib_sn ?? 0), verAplic: "NucleoContabil1",
  };
}

const cacheCert = new Map<number, { em: string; cert: Cert }>();

/** Configuração + certificado aberto da empresa (para emitir). */
export async function carregarEmpresa(codigoempresa: number): Promise<{ empresa: EmpresaNfse; cfg: ConfigNacional; cert: Cert }> {
  const { data } = await sb().from("nfse_empresas").select(`${CAMPOS},cert_pfx_enc,cert_senha_enc`).eq("codigoempresa", codigoempresa).maybeSingle();
  if (!data) throw new NacionalError("Empresa não cadastrada para emissão de NFS-e.");
  const e = data as unknown as EmpresaNfse & { cert_pfx_enc: string | null; cert_senha_enc: string | null };
  if (!e.cert_pfx_enc || !e.cert_senha_enc) throw new NacionalError(`${e.nome}: certificado A1 não enviado. Envie em Configuração.`);
  const marca = e.cert_enviado_em ?? "";
  let c = cacheCert.get(codigoempresa);
  if (!c || c.em !== marca) {
    c = { em: marca, cert: abrirPfx(decifrar(e.cert_pfx_enc), decifrar(e.cert_senha_enc).toString("utf8")) };
    cacheCert.set(codigoempresa, c);
  }
  return { empresa: e, cfg: paraConfig(e), cert: c.cert };
}

/** Só a configuração (sem abrir o certificado). */
export async function obterEmpresa(codigoempresa: number): Promise<EmpresaNfse> {
  const { data } = await sb().from("nfse_empresas").select(CAMPOS).eq("codigoempresa", codigoempresa).maybeSingle();
  if (!data) throw new NacionalError("Empresa não cadastrada para emissão de NFS-e.");
  return data as unknown as EmpresaNfse;
}

const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export async function salvarConfig(codigoempresa: number, c: Partial<EmpresaNfse>, email: string): Promise<void> {
  const campos: Record<string, unknown> = { atualizado_por: email, atualizado_em: new Date().toISOString() };
  if (c.im !== undefined) campos.im = String(c.im).trim().slice(0, 15);
  if (c.c_loc_emi !== undefined) {
    if (dig(c.c_loc_emi).length !== 7) throw new Error("O código IBGE do município tem 7 dígitos.");
    campos.c_loc_emi = dig(c.c_loc_emi);
  }
  if (c.serie !== undefined) {
    const n = Number(dig(c.serie));
    if (!(n >= 1 && n <= 49999)) throw new Error("A série da DPS vai de 1 a 49999.");
    campos.serie = String(n);
  }
  if (c.c_trib_nac !== undefined) {
    if (dig(c.c_trib_nac).length !== 6) throw new Error("O código de tributação nacional tem 6 dígitos (ex.: 171901).");
    campos.c_trib_nac = dig(c.c_trib_nac);
  }
  if (c.c_nbs !== undefined) {
    const d = dig(c.c_nbs);
    if (d && d.length !== 9) throw new Error("O código NBS tem 9 dígitos (ou fica em branco).");
    campos.c_nbs = d;
  }
  if (c.op_simp_nac !== undefined) {
    if (![1, 2, 3].includes(Number(c.op_simp_nac))) throw new Error("Regime inválido.");
    campos.op_simp_nac = Number(c.op_simp_nac);
  }
  if (c.p_tot_trib_sn !== undefined) {
    const n = c.p_tot_trib_sn === null || String(c.p_tot_trib_sn) === "" ? null : Number(String(c.p_tot_trib_sn).replace(",", "."));
    if (n !== null && !(n > 0 && n < 100)) throw new Error("% de tributos do Simples inválido.");
    campos.p_tot_trib_sn = n;
  }
  if (c.ambiente !== undefined) {
    if (c.ambiente !== "producao" && c.ambiente !== "homologacao") throw new Error("Ambiente inválido.");
    campos.ambiente = c.ambiente;
  }
  const { error } = await sb().from("nfse_empresas").update(campos).eq("codigoempresa", codigoempresa);
  if (error) throw new Error(error.message);
}

/**
 * Recebe o .pfx e a senha, confere (senha, chave privada, validade e se o CNPJ
 * é o da empresa) e só então grava cifrado.
 */
export async function salvarCertificado(codigoempresa: number, pfx: Buffer, senha: string, email: string) {
  const e = await obterEmpresa(codigoempresa);
  if (pfx.length < 500 || pfx.length > 60_000) throw new Error("Arquivo de certificado inválido (.pfx ou .p12).");
  const cert = abrirPfx(pfx, senha);
  if (cert.validade.getTime() < Date.now()) throw new Error(`Este certificado venceu em ${cert.validade.toLocaleDateString("pt-BR")}.`);
  if (!cert.cnpj) throw new Error("Não achei o CNPJ no certificado. Precisa ser o e-CNPJ A1 da empresa.");
  if (cert.cnpj.slice(0, 8) !== e.cnpj.slice(0, 8)) {
    throw new Error(`Este certificado é do CNPJ ${cert.cnpj} (${cert.titular.split(":")[0]}), não da ${e.nome}.`);
  }
  const { error } = await sb().from("nfse_empresas").update({
    cert_pfx_enc: cifrar(pfx), cert_senha_enc: cifrar(Buffer.from(senha, "utf8")),
    cert_validade: cert.validade.toISOString(), cert_cnpj: cert.cnpj, cert_titular: cert.titular.split(":")[0],
    cert_enviado_por: email, cert_enviado_em: new Date().toISOString(),
  }).eq("codigoempresa", codigoempresa);
  if (error) throw new Error(error.message);
  cacheCert.delete(codigoempresa);
  return { titular: cert.titular.split(":")[0], cnpj: cert.cnpj, validade: cert.validade.toISOString() };
}

export async function removerCertificado(codigoempresa: number, email: string) {
  const { error } = await sb().from("nfse_empresas").update({
    cert_pfx_enc: null, cert_senha_enc: null, cert_validade: null, cert_cnpj: null, cert_titular: null,
    cert_enviado_por: email, cert_enviado_em: new Date().toISOString(),
  }).eq("codigoempresa", codigoempresa);
  if (error) throw new Error(error.message);
  cacheCert.delete(codigoempresa);
}
