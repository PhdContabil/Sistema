// EFD-Reinf — envio do R-2099 (sem movimento) direto no webservice REST da
// Receita, com o certificado A1 da PHD (procurador). SERVIDOR.
// Não é SERPRO/Integra: a Reinf não cobra por chamada.

import https from "node:https";
import { loadPfx } from "./serpro/integra-contador";
import { assinarEventoReinf } from "./serpro/assinatura-xml";
import { carregarCredenciais } from "./serpro/servidor";
import { URL_REINF, idEvento, lerConsulta, lerEnvio, xmlLote, xmlR2099, type AmbienteReinf } from "./reinf-regras";

async function chaves() {
  const cred = await carregarCredenciais();
  if (!cred.pfx_base64) throw new Error("Certificado A1 não configurado (Tecnologia › Integra Contador).");
  return loadPfx(cred.pfx_base64, cred.pfx_senha ?? "");
}

function requisitar(url: string, metodo: "GET" | "POST", c: { privateKeyPem: string; certificatePem: string }, corpo?: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: metodo, key: c.privateKeyPem, cert: c.certificatePem, timeout: 45_000,
      headers: corpo ? { "Content-Type": "application/xml", "Content-Length": Buffer.byteLength(corpo) } : {},
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (d) => (data += d));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado falando com a EFD-Reinf.")));
    req.on("error", reject);
    if (corpo) req.write(corpo);
    req.end();
  });
}

/** Monta, assina e envia o R-2099 sem movimento. Devolve o protocolo do lote. */
export async function enviarR2099(cnpj: string, competencia: string, ambiente: AmbienteReinf) {
  const c = await chaves();
  const id = idEvento(cnpj);
  const assinado = assinarEventoReinf(xmlR2099({ id, cnpj, competencia, ambiente }), c);
  const r = await requisitar(`${URL_REINF[ambiente]}/recepcao/lotes`, "POST", c, xmlLote(cnpj, id, assinado));
  const e = lerEnvio(r.body);
  if (!e.protocolo) {
    throw new Error(`Reinf recusou o lote (HTTP ${r.status}): ${e.mensagem || r.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300)}`);
  }
  return { id, protocolo: e.protocolo };
}

/** Resultado do lote (processando / aceito / rejeitado). */
export async function consultarR2099(protocolo: string, ambiente: AmbienteReinf) {
  if (!/^[\w.\-]+$/.test(protocolo)) throw new Error("Protocolo inválido.");
  const c = await chaves();
  const r = await requisitar(`${URL_REINF[ambiente]}/consulta/lotes/${protocolo}`, "GET", c);
  if (r.status >= 500) return { estado: "processando" as const, recibo: null, mensagem: `Reinf indisponível (HTTP ${r.status}).` };
  return lerConsulta(r.body);
}
