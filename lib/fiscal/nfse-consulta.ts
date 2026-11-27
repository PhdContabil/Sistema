// Fiscal › Notas Fiscais › Consultar notas (SERVIDOR).
// Lê do ADN (Portal Nacional) as NFS-e em que a empresa é prestadora ou tomadora,
// pela distribuição por NSU, com o certificado da PHD (procuração eletrônica).
// Nada é guardado: o XML (gzip+base64, como vem do ADN) vai direto para a tela.
import https from "node:https";
import { gunzipSync } from "node:zlib";
import { db, EMPRESA_CERT_PHD } from "@/lib/nfse/procuracao";
import { carregarEmpresa } from "@/lib/nfse/empresas";
import { baixarDanfseOficial, NacionalError } from "@/lib/nfse/nacional";
import { gerarDanfse } from "@/lib/nfse/danfse";

type Cert = Awaited<ReturnType<typeof carregarEmpresa>>["cert"];
const ADN = "https://adn.nfse.gov.br";
const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");

// ------------------------------------------------------------------ cadastro
export interface EmpresaConsulta { codigoempresa: number; nome: string; cnpj: string; criado_por: string | null; criado_em: string }

export async function listarEmpresasConsulta(): Promise<EmpresaConsulta[]> {
  const { data, error } = await db().from("fiscal_nfse_consulta_empresas").select("*").order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []) as EmpresaConsulta[];
}

export async function cadastrarEmpresaConsulta(e: { codigoempresa: number; nome: string; cnpj: string }, email: string) {
  const cnpj = dig(e.cnpj);
  if (!Number(e.codigoempresa)) throw new NacionalError("Escolha a empresa.");
  if (cnpj.length !== 14) throw new NacionalError("A empresa precisa ter CNPJ (14 números).");
  const { error } = await db().from("fiscal_nfse_consulta_empresas")
    .upsert({ codigoempresa: Number(e.codigoempresa), nome: String(e.nome).trim(), cnpj, criado_por: email }, { onConflict: "codigoempresa" });
  if (error) throw new Error(error.message);
}

export async function removerEmpresaConsulta(cod: number) {
  const { error } = await db().from("fiscal_nfse_consulta_empresas").delete().eq("codigoempresa", cod);
  if (error) throw new Error(error.message);
}

// ------------------------------------------------------------------ ADN
function getJson(url: string, c: Cert): Promise<{ status: number; json: Record<string, unknown> | null; texto: string }> {
  return new Promise((resolve, reject) => {
    const agent = new https.Agent({ key: c.keyPem, cert: c.chainPem, minVersion: "TLSv1.2", keepAlive: false });
    const req = https.request(url, { method: "GET", agent, timeout: 25_000, headers: { Accept: "application/json" } }, (res) => {
      const partes: Buffer[] = [];
      res.on("data", (d) => partes.push(d));
      res.on("end", () => {
        const texto = Buffer.concat(partes).toString("utf8");
        let json: Record<string, unknown> | null = null;
        try { json = JSON.parse(texto); } catch { /* não é JSON */ }
        resolve({ status: res.statusCode ?? 0, json, texto });
      });
    });
    req.on("timeout", () => req.destroy(new Error("tempo esgotado")));
    req.on("error", (e) => reject(new NacionalError(`Sem resposta do Portal Nacional (${e.message}).`)));
    req.end();
  });
}

/** Lê campo ignorando maiúsculas (o ADN já trocou o "case" entre versões). */
const campo = (o: Record<string, unknown>, nome: string) => {
  const k = Object.keys(o).find((x) => x.toLowerCase() === nome.toLowerCase());
  return k ? o[k] : undefined;
};
const tag = (xml: string, t: string) => new RegExp(`<(?:\\w+:)?${t}>([^<]*)</(?:\\w+:)?${t}>`).exec(xml)?.[1]?.trim() ?? "";
const bloco = (xml: string, t: string) => new RegExp(`<(?:\\w+:)?${t}[\\s>][\\s\\S]*?</(?:\\w+:)?${t}>`).exec(xml)?.[0] ?? "";

export interface NotaConsulta {
  nsu: number; chave: string; numero: string; competencia: string; emissao: string;
  prestador_doc: string; prestador_nome: string; tomador_doc: string; tomador_nome: string;
  valor: number; descricao: string; tipo: "emitida" | "recebida"; cancelada: boolean;
  /** XML como veio do ADN: gzip em base64. */
  xml_gz: string;
}

function lerNota(xml: string, cnpj: string) {
  const emit = bloco(xml, "emit"), toma = bloco(xml, "toma");
  const pDoc = tag(emit, "CNPJ") || tag(emit, "CPF");
  return {
    numero: tag(xml, "nNFSe"), competencia: tag(xml, "dCompet"), emissao: (tag(xml, "dhEmi") || tag(xml, "dhProc")).slice(0, 10),
    prestador_doc: pDoc, prestador_nome: tag(emit, "xNome"),
    tomador_doc: tag(toma, "CNPJ") || tag(toma, "CPF"), tomador_nome: tag(toma, "xNome"),
    valor: Number(tag(bloco(xml, "vServPrest"), "vServ") || tag(xml, "vLiq") || 0),
    descricao: tag(xml, "xDescServ"), tipo: (pDoc === cnpj ? "emitida" : "recebida") as "emitida" | "recebida",
  };
}

/**
 * Lê as notas a partir do NSU informado, até acabar ou até o tempo da função
 * apertar. Quem chama repete com `proximoNsu` enquanto `incompleto` for true.
 * `ate` (AAAA-MM-DD): o ADN entrega em ordem de chegada; quando uma página
 * inteira já é de notas emitidas mais de 45 dias depois do fim do período, para.
 */
export async function capturarNotas(cnpjEntrada: string, nsuInicial = 0, orcamentoMs = 45_000, ate = "") {
  const limite = /^d{4}-d{2}-d{2}$/.test(ate) ? new Date(Date.parse(ate) + 45 * 864e5).toISOString().slice(0, 10) : "";
  let passou = false;
  const cnpj = dig(cnpjEntrada);
  if (cnpj.length !== 14) throw new NacionalError("CNPJ inválido.");
  const { cert } = await carregarEmpresa(EMPRESA_CERT_PHD);
  const t0 = Date.now();
  const notas: NotaConsulta[] = [];
  const canceladas: string[] = [];
  let nsu = nsuInicial, incompleto = false;
  for (let pag = 0; ; pag++) {
    if (Date.now() - t0 > orcamentoMs || notas.length > 1500) { incompleto = true; break; }
    const r = await getJson(`${ADN}/contribuintes/DFe/${nsu}?cnpjConsulta=${cnpj}&lote=true`, cert);
    if (r.status === 404 || (r.json && /NENHUM_DOCUMENTO/i.test(String(campo(r.json, "StatusProcessamento") ?? "")))) break;
    if (r.status !== 200 || !r.json) {
      const erros = r.json ? JSON.stringify(campo(r.json, "Erros") ?? r.json).slice(0, 400) : r.texto.slice(0, 300).replace(/\s+/g, " ");
      const dica = r.status === 401 || r.status === 403 || /procura|autoriz|permiss/i.test(erros)
        ? " — confira se a procuração eletrônica do cliente para a PHD inclui a consulta de NFS-e." : "";
      throw new NacionalError(`Portal Nacional HTTP ${r.status}: ${erros}${dica}`);
    }
    const lote = (campo(r.json, "LoteDFe") ?? []) as Record<string, unknown>[];
    if (!lote.length) break;
    let maior = nsu, notasPag = 0, dentro = 0;
    for (const d of lote) {
      const n = Number(campo(d, "NSU") ?? 0);
      if (n > maior) maior = n;
      const gz = String(campo(d, "ArquivoXml") ?? "");
      if (!gz) continue;
      let xml = "";
      try { xml = gunzipSync(Buffer.from(gz, "base64")).toString("utf8"); } catch { continue; }
      const tipoDoc = String(campo(d, "TipoDocumento") ?? "").toUpperCase();
      const chave = String(campo(d, "ChaveAcesso") ?? "") || tag(xml, "chNFSe");
      if (tipoDoc === "EVENTO" || /<(?:\w+:)?pedRegEvento/.test(xml)) {
        if (/101101/.test(xml)) canceladas.push(tag(xml, "chNFSe") || chave);
        continue;
      }
      if (!/<(?:\w+:)?infNFSe/.test(xml)) continue;
      const nota = { nsu: n, chave: dig(chave), cancelada: false, xml_gz: gz, ...lerNota(xml, cnpj) };
      notasPag++;
      if (!limite || !nota.emissao || nota.emissao <= limite) dentro++;
      notas.push(nota);
    }
    if (limite && notasPag > 0 && dentro === 0) { passou = true; break; }
    if (maior < nsu) break;
    nsu = maior + 1;
    if (lote.length < 50) break;
  }
  return { notas, canceladas, proximoNsu: nsu, incompleto: incompleto && !passou };
}

/** PDF de uma nota consultada: DANFSe oficial do ADN; se falhar, gerado do XML. */
export async function pdfDaConsulta(chave: string, xmlGz: string): Promise<{ pdf: Buffer; oficial: boolean; motivo: string }> {
  const { cert } = await carregarEmpresa(EMPRESA_CERT_PHD);
  const of = await baixarDanfseOficial(dig(chave), 1, cert);
  if (of.pdf) return { pdf: of.pdf, oficial: true, motivo: "" };
  const xml = gunzipSync(Buffer.from(xmlGz, "base64")).toString("utf8");
  return { pdf: await gerarDanfse(xml, dig(chave), 1), oficial: false, motivo: of.motivo };
}
