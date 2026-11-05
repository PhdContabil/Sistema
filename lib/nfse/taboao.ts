// Cliente SOAP do webservice de NFS-e de Taboão da Serra (eTransparência) — SERVIDOR.
// Porta de src/client.py do app phd_nfse. As credenciais são da PHD e ficam só
// na Vercel: NFSE_TABOAO_CODIGO_USUARIO e NFSE_TABOAO_CODIGO_CONTRIBUINTE.
import {
  escaparXml, lerResposta, lerImpressao, montarSdtrps,
  type NotaNfse, type Resposta, type DadosImpressao,
} from "./formato";

const WS_URL = process.env.NFSE_TABOAO_WS_URL
  ?? "https://nfe.etransparencia.com.br/sp.taboaodaserra/webservice/aws_nfe.aspx";

export class NfseError extends Error {}

export function credenciaisOk(): boolean {
  return Boolean(process.env.NFSE_TABOAO_CODIGO_USUARIO && process.env.NFSE_TABOAO_CODIGO_CONTRIBUINTE);
}

function login(comVersao = false): string {
  const u = process.env.NFSE_TABOAO_CODIGO_USUARIO;
  const c = process.env.NFSE_TABOAO_CODIGO_CONTRIBUINTE;
  if (!u || !c) {
    throw new NfseError("Credenciais da prefeitura não configuradas (NFSE_TABOAO_CODIGO_USUARIO e NFSE_TABOAO_CODIGO_CONTRIBUINTE na Vercel).");
  }
  return `<Login><CodigoUsuario>${escaparXml(u)}</CodigoUsuario><CodigoContribuinte>${escaparXml(c)}</CodigoContribuinte>${comVersao ? "<Versao>4.00</Versao>" : ""}</Login>`;
}

async function chamar(metodo: string, inner: string): Promise<string> {
  const envelope = '<?xml version="1.0" encoding="utf-8"?>'
    + '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns="NFe">'
    + `<soapenv:Header/><soapenv:Body><ws_nfe.${metodo}>${inner}</ws_nfe.${metodo}></soapenv:Body></soapenv:Envelope>`;
  let r: Response;
  try {
    r = await fetch(WS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `NFeaction/AWS_NFE.${metodo}` },
      body: envelope,
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e) {
    throw new NfseError(`Sem resposta da prefeitura (${e instanceof Error ? e.message : "rede"}).`);
  }
  const texto = await r.text();
  if (!r.ok) throw new NfseError(`Prefeitura respondeu HTTP ${r.status}: ${texto.slice(0, 300)}`);
  return texto;
}

/** VERFICARPS: valida o XML na prefeitura sem emitir nota. */
export async function verificar(n: NotaNfse): Promise<Resposta> {
  return lerResposta(await chamar("VERFICARPS", `<Sdt_processarpsin>${login()}${montarSdtrps(n)}</Sdt_processarpsin>`));
}

/** PROCESSARPS: emite a NFS-e. */
export async function emitir(n: NotaNfse): Promise<Resposta> {
  return lerResposta(await chamar("PROCESSARPS", `<Sdt_processarpsin>${login()}${montarSdtrps(n)}</Sdt_processarpsin>`));
}

/** IMPRESSAOLINKNFSE: link do PDF pela RPS (ordem dos campos é exigida pelo schema). */
export async function linkPdf(serieRps: string, numeroRps: number, mes: number, ano: number): Promise<{ dados: DadosImpressao | null; manutencao: boolean }> {
  const corpo = `<Competencia_Mes>${String(mes).padStart(2, "0")}</Competencia_Mes>`
    + `<Competencia_Ano>${ano}</Competencia_Ano>`
    + `<RPS_Serie>${escaparXml(serieRps)}</RPS_Serie><RPS_Numero>${numeroRps}</RPS_Numero>`
    + "<Nota_Serie></Nota_Serie><Nota_Numero>0</Nota_Numero>";
  const entrada = `<SDT_IMPRESSAO_IN xmlns="NFe">${login(true)}<Nota>${corpo}</Nota></SDT_IMPRESSAO_IN>`;
  const xml = await chamar("IMPRESSAOLINKNFSE", `<Xml_entrada>${escaparXml(entrada)}</Xml_entrada>`);
  return { dados: lerImpressao(xml), manutencao: /manuten[cç][aã]o/i.test(xml) };
}
