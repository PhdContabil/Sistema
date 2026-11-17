// Tecnologia · Integra Contador — configuração do cofre SERPRO (certificado A1
// da PHD + consumer key/secret + CNPJ contratante). SERVIDOR.
// Nunca devolve segredos: só metadados (titular, CNPJ, validade, "tem/não tem").

import { autenticar, inspecionarCertificado } from "./integra-contador";
import { carregarCredenciais, db, soDigitos } from "./servidor";

export interface MetadadosSerpro {
  configurado: boolean;
  cert_titular: string | null;
  cert_cnpj: string | null;
  cert_validade: string | null;
  contratante_cnpj: string | null;
  tem_certificado: boolean;
  tem_consumer_key: boolean;
  tem_consumer_secret: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

export async function obterMetadados(): Promise<MetadadosSerpro> {
  const { data, error } = await db().from("credenciais_serpro")
    .select("cert_titular, cert_cnpj, cert_validade, contratante_cnpj, consumer_key, consumer_secret, pfx_base64, updated_at, updated_by")
    .eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Partial<Record<
    "cert_titular" | "cert_cnpj" | "cert_validade" | "contratante_cnpj" | "consumer_key" | "consumer_secret" | "pfx_base64" | "updated_at" | "updated_by",
    string | null
  >>;
  return {
    configurado: !!(d.consumer_key && d.consumer_secret && d.pfx_base64 && d.contratante_cnpj),
    cert_titular: d.cert_titular ?? null,
    cert_cnpj: d.cert_cnpj ?? null,
    cert_validade: d.cert_validade ?? null,
    contratante_cnpj: d.contratante_cnpj ?? null,
    tem_certificado: !!d.pfx_base64,
    tem_consumer_key: !!d.consumer_key,
    tem_consumer_secret: !!d.consumer_secret,
    updated_at: d.updated_at ?? null,
    updated_by: d.updated_by ?? null,
  };
}

export interface NovaConfiguracao {
  consumerKey?: string;
  consumerSecret?: string;
  pfxBase64?: string;
  pfxSenha?: string;
  contratanteCnpj?: string;
}

/**
 * Grava só o que veio preenchido. Certificado novo é validado ANTES de gravar
 * (senha, titular, CNPJ, validade) e vencido é recusado. Sem CNPJ contratante,
 * usa o do próprio certificado.
 */
export async function salvarConfiguracao(c: NovaConfiguracao, por: string) {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: por };
  if (c.consumerKey?.trim()) update.consumer_key = c.consumerKey.trim();
  if (c.consumerSecret?.trim()) update.consumer_secret = c.consumerSecret.trim();
  if (c.contratanteCnpj?.trim()) {
    const cnpj = soDigitos(c.contratanteCnpj);
    if (cnpj.length !== 14) throw new Error("CNPJ contratante inválido.");
    update.contratante_cnpj = cnpj;
  }

  let meta: ReturnType<typeof inspecionarCertificado> | null = null;
  if (c.pfxBase64) {
    if (!c.pfxSenha) throw new Error("Informe a senha do certificado.");
    try {
      meta = inspecionarCertificado(c.pfxBase64, c.pfxSenha);
    } catch (e) {
      throw new Error(`Certificado ou senha inválidos: ${e instanceof Error ? e.message : e}`);
    }
    if (!meta.valido) throw new Error(`Certificado vencido em ${meta.validade}. Envie um certificado válido.`);
    Object.assign(update, {
      pfx_base64: c.pfxBase64, pfx_senha: c.pfxSenha,
      cert_titular: meta.titular, cert_cnpj: meta.cnpj, cert_validade: meta.validade,
    });
    if (!update.contratante_cnpj && meta.cnpj) update.contratante_cnpj = meta.cnpj;
  }

  const { error } = await db().from("credenciais_serpro").upsert({ id: 1, ...update }, { onConflict: "id" });
  if (error) throw new Error(error.message);
  return { ok: true, certificado: meta };
}

/** Autentica no SERPRO com o que está gravado (não consome serviço do Integra Contador). */
export async function testarConexao() {
  const t0 = Date.now();
  try {
    const t = await autenticar(await carregarCredenciais());
    return { ok: true, mensagem: `Autenticação aceita pelo SERPRO (token válido por ${Math.round((t.expires_in ?? 0) / 60)} min).`, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
  }
}
