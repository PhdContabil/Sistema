// Integra Contador (SERPRO) — autenticação e consumo do gateway. SERVIDOR.
//
// 1. loadPfx()    -> extrai chave + certificado do A1 (.pfx) em PEM
// 2. autenticar() -> POST /authenticate com mTLS (A1) + Basic(consumer key:secret)
// 3. consumir()   -> POST no gateway com Bearer + jwt_token (SEM mTLS)
//
// O A1 só entra no /authenticate. Cada chamada ao gateway é PAGA: nada aqui
// roda sozinho, quem chama decide. Base de SITFIS, DCTFWeb, Procurações e
// Parcelamentos. Vindo de app-empresas-integra/lib/integraContador.mjs.

import https from "node:https";
import forge from "node-forge";

export const ENDPOINT_AUTH = "https://autenticacao.sapi.serpro.gov.br/authenticate";
export const GATEWAY_BASE = "https://gateway.apiserpro.serpro.gov.br/integra-contador/v1";

export type Metodo = "Consultar" | "Emitir" | "Declarar" | "Apoiar" | "Monitorar";

export interface Participante { numero: string; tipo: 1 | 2 }

export interface TokensSerpro {
  access_token: string;
  jwt_token: string;
  expires_in?: number;
  obtidoEm: number;
}

export interface CredenciaisSerpro {
  consumer_key: string | null;
  consumer_secret: string | null;
  pfx_base64: string | null;
  pfx_senha: string | null;
  contratante_cnpj: string | null;
}

export interface RespostaGateway {
  httpStatus: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
  raw: string;
}

export class TokenExpiradoError extends Error {
  constructor() { super("Token SERPRO expirado (HTTP 401) — reautentique."); }
}

export function loadPfx(pfxBase64: string, senha: string) {
  const der = forge.util.decode64(pfxBase64.replace(/^data:[^;]+;base64,/, ""));
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), false, senha);

  const shrouded = forge.pki.oids.pkcs8ShroudedKeyBag;
  const plain = forge.pki.oids.keyBag;
  const keyBag = p12.getBags({ bagType: shrouded })[shrouded]?.[0]
    ?? p12.getBags({ bagType: plain })[plain]?.[0];
  if (!keyBag?.key) throw new Error("Não consegui extrair a chave privada do certificado (senha errada?).");

  const certOid = forge.pki.oids.certBag;
  const certBag = p12.getBags({ bagType: certOid })[certOid]?.[0];
  if (!certBag?.cert) throw new Error("Não consegui extrair o certificado do PFX.");

  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certificatePem: forge.pki.certificateToPem(certBag.cert),
    certificate: certBag.cert,
  };
}

/** Titular, CNPJ e validade do A1 — para exibir na tela, nunca os segredos. */
export function inspecionarCertificado(pfxBase64: string, senha: string) {
  const { certificate } = loadPfx(pfxBase64, senha);
  const cn = String(certificate.subject.getField("CN")?.value ?? "");
  const cnpj = cn.match(/:(\d{11,14})$/)?.[1] ?? "";
  const notAfter = certificate.validity.notAfter;
  return {
    titular: cn.replace(/:(\d{11,14})$/, "").trim(),
    cnpj,
    validade: notAfter.toISOString().slice(0, 10),
    valido: notAfter > new Date(),
  };
}

function httpsRequest(opts: {
  url: string; headers: Record<string, string>; body: string; cert?: string; key?: string;
}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(opts.url);
    const req = https.request(
      {
        hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search,
        method: "POST", headers: opts.headers,
        ...(opts.cert && opts.key ? { cert: opts.cert, key: opts.key } : {}),
        timeout: 45_000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado falando com o SERPRO.")));
    req.on("error", reject);
    req.write(opts.body);
    req.end();
  });
}

export async function autenticar(cred: CredenciaisSerpro): Promise<TokensSerpro> {
  if (!cred.consumer_key || !cred.consumer_secret || !cred.pfx_base64) {
    throw new Error("Credenciais SERPRO incompletas (consumer key/secret ou certificado A1).");
  }
  const { privateKeyPem, certificatePem } = loadPfx(cred.pfx_base64, cred.pfx_senha ?? "");
  const basic = Buffer.from(`${cred.consumer_key}:${cred.consumer_secret}`).toString("base64");

  const resp = await httpsRequest({
    url: ENDPOINT_AUTH,
    headers: {
      Authorization: `Basic ${basic}`,
      "Role-Type": "TERCEIROS",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cert: certificatePem,
    key: privateKeyPem,
  });

  if (resp.status !== 200) {
    throw new Error(`Falha na autenticação SERPRO (HTTP ${resp.status}): ${resp.body.slice(0, 300)}`);
  }
  let json: Partial<TokensSerpro>;
  try { json = JSON.parse(resp.body); } catch { throw new Error("Resposta de autenticação do SERPRO não é JSON."); }
  if (!json.access_token || !json.jwt_token) throw new Error("Autenticação SERPRO sem os tokens esperados.");
  return { ...(json as TokensSerpro), obtidoEm: Date.now() };
}

export async function consumir(p: {
  tokens: TokensSerpro;
  metodo: Metodo;
  contratante: Participante;
  autorPedidoDados?: Participante;
  contribuinte: Participante;
  pedidoDados: { idSistema: string; idServico: string; versaoSistema: string; dados: string };
}): Promise<RespostaGateway> {
  const resp = await httpsRequest({
    url: `${GATEWAY_BASE}/${p.metodo}`,
    headers: {
      Authorization: `Bearer ${p.tokens.access_token}`,
      jwt_token: p.tokens.jwt_token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      contratante: p.contratante,
      autorPedidoDados: p.autorPedidoDados ?? p.contratante,
      contribuinte: p.contribuinte,
      pedidoDados: p.pedidoDados,
    }),
  });
  if (resp.status === 401) throw new TokenExpiradoError();
  let json = null;
  try { json = JSON.parse(resp.body); } catch { /* erro de gateway pode vir em HTML */ }
  return { httpStatus: resp.status, json, raw: resp.body };
}

/** `dados` do retorno vem como string JSON. */
export function dadosDe(r: RespostaGateway): unknown {
  const d = r.json?.dados;
  if (typeof d !== "string") return d ?? null;
  try { return JSON.parse(d); } catch { return null; }
}

export function textoMensagens(r: RespostaGateway): string {
  const m = r.json?.mensagens;
  if (!Array.isArray(m)) return "";
  return m.map((x: { codigo?: string; texto?: string }) => [x.codigo, x.texto].filter(Boolean).join(" ")).join(" | ");
}

export function participante(numeroRaw: string | null | undefined): Participante {
  const numero = String(numeroRaw ?? "").replace(/\D/g, "");
  return { numero, tipo: numero.length === 11 ? 1 : 2 };
}
