// Assinatura XMLDSig (envelopada) do <ConteudoDeclaracao id="..."> do
// ProcDctf da DCTFWeb, com a chave + certificado do A1. SERVIDOR.
//
// Perfil RFB: Reference URI "#<id>", transforms enveloped-signature + C14N
// (REC-xml-c14n-20010315), digest SHA-256, assinatura RSA-SHA256, KeyInfo com
// X509Data/X509Certificate, Signature como ÚLTIMO filho de <ProcDctf>.
// Assina exatamente o XML devolvido pelo SERPRO, sem reformatar.
// Vindo de app-empresas-integra/lib/assinaturaXml.mjs.

import { SignedXml } from "xml-crypto";

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const SHA256_DIGEST = "http://www.w3.org/2001/04/xmlenc#sha256";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";

export function extrairIdConteudo(xml: string): string | null {
  return xml.match(/<ConteudoDeclaracao[^>]*\sid="([^"]+)"/)?.[1] ?? null;
}

export function assinarProcDctf(xml: string, chaves: { privateKeyPem: string; certificatePem: string }): string {
  const id = extrairIdConteudo(xml);
  if (!id) throw new Error("Não encontrei o id do ConteudoDeclaracao no XML.");

  const certLimpo = chaves.certificatePem
    .replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----/g, "")
    .replace(/\r?\n/g, "")
    .trim();

  const sig = new SignedXml({
    privateKey: chaves.privateKeyPem,
    publicCert: chaves.certificatePem,
    signatureAlgorithm: RSA_SHA256,
    canonicalizationAlgorithm: C14N,
  });
  sig.addReference({
    xpath: "//*[local-name(.)='ConteudoDeclaracao']",
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: SHA256_DIGEST,
    uri: id,
  });
  sig.getKeyInfoContent = () => `<X509Data><X509Certificate>${certLimpo}</X509Certificate></X509Data>`;
  sig.computeSignature(xml, { location: { reference: "//*[local-name(.)='ProcDctf']", action: "append" } });
  return sig.getSignedXml();
}
