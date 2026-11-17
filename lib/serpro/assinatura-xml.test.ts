// node --experimental-strip-types --test lib/serpro/assinatura-xml.test.ts
//
// Assina um ProcDctf com um certificado de teste (gerado aqui, autoassinado)
// e confere: assinatura válida, URI "#id", última posição em <ProcDctf>,
// algoritmos do perfil da RFB e o XML original preservado.
import test from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import { assinarProcDctf, extrairIdConteudo } from "./assinatura-xml.ts";

function certificadoTeste() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const attrs = [{ name: "commonName", value: "TESTE:00000000000191" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey), certificatePem: forge.pki.certificateToPem(cert) };
}

const XML = '<?xml version="1.0" encoding="UTF-8"?><ProcDctf xmlns="http://www.rfb.gov.br/dctfweb"><ConteudoDeclaracao id="ID123"><valor>10</valor></ConteudoDeclaracao><Outro>x</Outro></ProcDctf>';

test("extrai o id do ConteudoDeclaracao", () => {
  assert.equal(extrairIdConteudo(XML), "ID123");
  assert.equal(extrairIdConteudo("<ProcDctf/>"), null);
});

test("assina no perfil da RFB e a assinatura confere", () => {
  const chaves = certificadoTeste();
  const assinado = assinarProcDctf(XML, chaves);

  assert.match(assinado, /<Reference URI="#ID123">/);
  assert.match(assinado, /rsa-sha256/);
  assert.match(assinado, /xmlenc#sha256/);
  assert.match(assinado, /REC-xml-c14n-20010315/);
  assert.match(assinado, /<X509Certificate>[A-Za-z0-9+/=]+<\/X509Certificate>/);
  assert.match(assinado, /<Outro>x<\/Outro><Signature[\s\S]*<\/Signature><\/ProcDctf>$/, "Signature como último filho de ProcDctf");
  assert.match(assinado, /<ConteudoDeclaracao id="ID123"><valor>10<\/valor><\/ConteudoDeclaracao>/, "conteúdo preservado");

  const sig = assinado.match(/<Signature[\s\S]*<\/Signature>/)![0];
  const v = new SignedXml({ publicCert: chaves.certificatePem });
  v.loadSignature(sig);
  assert.equal(v.checkSignature(assinado), true);
});

test("recusa XML sem ConteudoDeclaracao", () => {
  assert.throws(() => assinarProcDctf("<ProcDctf/>", certificadoTeste()), /ConteudoDeclaracao/);
});
