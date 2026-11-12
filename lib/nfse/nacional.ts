// Cliente do Padrão Nacional de NFS-e (Sefin Nacional) — SERVIDOR.
// Não lê ambiente nem banco: recebe a configuração e o certificado A1 da
// empresa emissora (ver lib/nfse/empresas.ts).
import https from "node:https";
import zlib from "node:zlib";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import { montarDps, dhEmiAgora, lerRespostaSefin, lerNfse, textoErros, problemasConfig, type ConfigNacional, type NotaNac } from "./nacional-formato";

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";

export class NacionalError extends Error {}

function sefinUrl(amb: 1 | 2): string {
  return amb === 1 ? "https://sefin.nfse.gov.br/SefinNacional" : "https://sefin.producaorestrita.nfse.gov.br/SefinNacional";
}

export interface Cert { keyPem: string; certPem: string; chainPem: string; certB64: string; cnpj: string | null; validade: Date; titular: string }
/** Abre o A1 com node-forge (aceita PFX legado RC2/3DES que o OpenSSL 3 recusa). */
export function abrirPfx(pfx: Buffer, senha: string): Cert {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(pfx.toString("binary"))), false, senha);
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    throw new NacionalError(/mac|password|decrypt/i.test(m) ? "Senha do certificado A1 incorreta." : `Não consegui abrir o certificado A1: ${m}`);
  }
  const bag = (t: string) => (p12.getBags({ bagType: t })[t] ?? []);
  const keyBag = [...bag(forge.pki.oids.pkcs8ShroudedKeyBag), ...bag(forge.pki.oids.keyBag)][0];
  const key = keyBag?.key as forge.pki.rsa.PrivateKey | undefined;
  if (!key) throw new NacionalError("O certificado não tem a chave privada. Exporte o A1 de novo, com a chave.");
  const certs = bag(forge.pki.oids.certBag).map((b) => b.cert).filter(Boolean) as forge.pki.Certificate[];
  const titular = certs.find((c) => (c.publicKey as forge.pki.rsa.PublicKey).n.equals(key.n)) ?? certs[0];
  if (!titular) throw new NacionalError("O certificado não tem o certificado do titular.");
  const certPem = forge.pki.certificateToPem(titular);
  const cadeia = certs.filter((c) => c !== titular).map((c) => forge.pki.certificateToPem(c));
  const cn = String(titular.subject.getField("CN")?.value ?? "");
  return {
    keyPem: forge.pki.privateKeyToPem(key),
    certPem,
    chainPem: [certPem, ...cadeia].join(""),
    certB64: certPem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""),
    cnpj: /:(\d{14})\s*$/.exec(cn)?.[1] ?? null,
    validade: titular.validity.notAfter,
    titular: cn,
  };
}

export function conferirCertificado(c: Cert, cnpj: string) {
  if (c.validade.getTime() < Date.now()) throw new NacionalError(`Certificado A1 vencido em ${c.validade.toLocaleDateString("pt-BR")}.`);
  if (c.cnpj && c.cnpj.slice(0, 8) !== cnpj.slice(0, 8)) throw new NacionalError(`O certificado é do CNPJ ${c.cnpj}, não desta empresa.`);
}

/** XMLDSig enveloped sobre <infDPS>, sem prefixo ds: (E1228), RSA-SHA1 + C14N. */
export function assinar(xml: string, id: string, c: Cert, elemento = "infDPS"): string {
  const sig = new SignedXml({ privateKey: c.keyPem, publicCert: c.certPem, canonicalizationAlgorithm: C14N, signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1" });
  sig.addReference({
    xpath: `//*[local-name(.)='${elemento}' and @Id='${id}']`,
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", C14N],
  });
  sig.getKeyInfoContent = () => `<X509Data><X509Certificate>${c.certB64}</X509Certificate></X509Data>`;
  sig.computeSignature(xml, { location: { reference: `//*[local-name(.)='${elemento}']`, action: "after" } });
  return '<?xml version="1.0" encoding="UTF-8"?>' + sig.getSignedXml().replace(/<\?xml[^?]*\?>/, "").trim();
}

function requisitar(metodo: "GET" | "POST", url: string, corpo: unknown | null, c: Cert, timeout: number): Promise<{ status: number; json: unknown; texto: string }> {
  return new Promise((resolve, reject) => {
    const dados = corpo == null ? null : Buffer.from(JSON.stringify(corpo));
    const agent = new https.Agent({ key: c.keyPem, cert: c.chainPem, minVersion: "TLSv1.2", keepAlive: false });
    const req = https.request(url, {
      method: metodo, agent, timeout,
      headers: { Accept: "application/json", ...(dados ? { "Content-Type": "application/json", "Content-Length": dados.length } : {}) },
    }, (res) => {
      const partes: Buffer[] = [];
      res.on("data", (d) => partes.push(d));
      res.on("end", () => {
        const texto = Buffer.concat(partes).toString("utf8");
        let json: unknown = null;
        try { json = JSON.parse(texto); } catch { /* não é JSON */ }
        resolve({ status: res.statusCode ?? 0, json, texto });
      });
    });
    req.on("timeout", () => req.destroy(new Error("tempo esgotado")));
    req.on("error", (e) => reject(new NacionalError(`Sem resposta da Sefin Nacional (${e.message}).`)));
    if (dados) req.write(dados);
    req.end();
  });
}

export type ResultadoNac =
  | { ok: true; chave: string; nNFSe: string | null; dhProc: string | null; vLiq: string | null; nfseXml: string; dpsXml: string }
  | { ok: false; erro: string; codigos: string[] };

/** Assina e envia uma DPS. Uma por chamada (a Sefin não recebe lote). */
export async function emitirNacional(n: NotaNac, cfg: ConfigNacional, c: Cert): Promise<ResultadoNac> {
  const falta = problemasConfig(cfg);
  if (falta.length) throw new NacionalError(`Configuração da empresa incompleta: ${falta.join(", ")}.`);
  conferirCertificado(c, cfg.cnpj);
  const { id, xml } = montarDps(n, cfg, dhEmiAgora());
  const assinado = assinar(xml, id, c);
  const dpsXmlGZipB64 = zlib.gzipSync(Buffer.from(assinado, "utf8")).toString("base64");
  const r = await requisitar("POST", `${sefinUrl(cfg.ambiente)}/nfse`, { dpsXmlGZipB64 }, c, 60_000);
  const resp = lerRespostaSefin(r.json);
  if (resp.chave && resp.erros.length === 0) {
    const nfseXml = resp.nfseB64 ? zlib.gunzipSync(Buffer.from(resp.nfseB64, "base64")).toString("utf8") : "";
    const d = lerNfse(nfseXml);
    return { ok: true, chave: resp.chave, nNFSe: d.nNFSe, dhProc: d.dhProc, vLiq: d.vLiq, nfseXml, dpsXml: assinado };
  }
  const erro = resp.erros.length ? textoErros(resp.erros) : `HTTP ${r.status}: ${r.texto.slice(0, 300)}`;
  return { ok: false, erro, codigos: resp.erros.map((e) => e.codigo) };
}

/** NFS-e já emitida, pela chave de acesso (GET {Sefin}/nfse/{chave}). */
export async function consultarNfse(chave: string, amb: 1 | 2, c: Cert): Promise<string | null> {
  const r = await requisitar("GET", `${sefinUrl(amb)}/nfse/${chave}`, null, c, 30_000);
  const b64 = (r.json as Record<string, string> | null)?.nfseXmlGZipB64 ?? (r.json as Record<string, string> | null)?.NfseXmlGZipB64;
  return b64 ? zlib.gunzipSync(Buffer.from(b64, "base64")).toString("utf8") : null;
}

/** Código IBGE do município pelo CEP (ViaCEP), quando o Questor não manda. */
export async function ibgePorCep(cep: string): Promise<string | null> {
  const d = cep.replace(/\D/g, "");
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const j = (await r.json()) as { ibge?: string; erro?: boolean };
    return j.ibge && /^\d{7}$/.test(j.ibge) ? j.ibge : null;
  } catch {
    return null;
  }
}

/**
 * DANFSe OFICIAL, gerado pelo próprio Portal Nacional (ADN): GET /danfse/{chave}
 * com o certificado da empresa. Devolve o PDF ou o motivo de não ter vindo
 * (o serviço já ficou fora do ar em 2026; quem chama cai no PDF local).
 */
export function baixarDanfseOficial(chave: string, amb: 1 | 2, c: Cert): Promise<{ pdf: Buffer | null; motivo: string }> {
  const base = amb === 1 ? "https://adn.nfse.gov.br" : "https://adn.producaorestrita.nfse.gov.br";
  return new Promise((resolve) => {
    const agent = new https.Agent({ key: c.keyPem, cert: c.chainPem, minVersion: "TLSv1.2", keepAlive: false });
    const req = https.request(`${base}/danfse/${chave}`, { method: "GET", agent, timeout: 25_000, headers: { Accept: "application/pdf" } }, (res) => {
      const partes: Buffer[] = [];
      res.on("data", (d) => partes.push(d));
      res.on("end", () => {
        const b = Buffer.concat(partes);
        if (res.statusCode === 200 && b.subarray(0, 4).toString() === "%PDF") resolve({ pdf: b, motivo: "" });
        else resolve({ pdf: null, motivo: `HTTP ${res.statusCode}: ${b.subarray(0, 200).toString("utf8").replace(/\s+/g, " ")}` });
      });
    });
    req.on("timeout", () => req.destroy(new Error("tempo esgotado")));
    req.on("error", (e) => resolve({ pdf: null, motivo: e.message }));
    req.end();
  });
}
