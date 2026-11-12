// NFS-e pelo Padrão Nacional (Sefin Nacional / ADN) — partes puras.
// Segue o "Guia emissao NFS-e Portal Nacional.md" (leiaute DPS 1.01).
// A prefeitura de Taboão (eTransparência) deixou de funcionar: a PHD emite aqui.
//
// SEM IMPORTS: roda direto no `node --test` com strip-types.

export interface ConfigNacional {
  ambiente: 1 | 2;          // 1 produção, 2 produção restrita (homologação)
  cnpj: string;
  im: string;
  cLocEmi: string;          // IBGE 7 dígitos do município emissor
  serie: string;            // 1..49999 (aplicativo próprio)
  cTribNac: string;         // 6 dígitos
  cNBS: string;             // 9 dígitos
  opSimpNac: 1 | 2 | 3;     // 1 não optante, 2 MEI, 3 ME/EPP
  pTotTribSN: number;       // % aproximado dos tributos do Simples (só ME/EPP)
  verAplic: string;
}

/** PHD CONTABIL LTDA — Simples Nacional (ME/EPP), Taboão da Serra/SP. */
export const PHD_NACIONAL: Omit<ConfigNacional, "ambiente" | "pTotTribSN"> = {
  cnpj: "11274011000186",
  im: "30837",
  cLocEmi: "3552809",
  serie: "1",
  cTribNac: "171901", // item 17.19 (contabilidade), desdobro 01 — CTN 171901000
  cNBS: "113022100",
  opSimpNac: 3,
  verAplic: "NucleoContabil1",
};

export interface TomadorNac {
  cpf_cnpj: string;
  razao_social: string;
  inscricao_municipal: string;
  email: string;
  tipo_logradouro: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  ibge: string;             // 7 dígitos
}

export interface NotaNac {
  nDPS: number;
  /** Série da DPS desta nota (avulsas usam série própria). Padrão: a da empresa. */
  serie?: string;
  dCompet: string;          // YYYY-MM-DD
  valor: number;
  descricao: string;
  infoCompl: string;
  tomador: TomadorNac;
}

/** Texto TSString: Latin-1 visível, sem controle, espaços colapsados, cortado e escapado. */
export function txt(v: string | null | undefined, max: number): string {
  let s = String(v ?? "")
    .replace(/[–—−]/g, "-").replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"').replace(/…/g, "...")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/[^\u0000-ÿ]/g, "")
    .replace(/\s+/g, " ").trim().slice(0, max);
  s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return s;
}

export const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export function idDps(c: Pick<ConfigNacional, "cLocEmi" | "cnpj" | "serie">, nDPS: number): string {
  return `DPS${c.cLocEmi}2${c.cnpj}${c.serie.padStart(5, "0")}${String(nDPS).padStart(15, "0")}`;
}

/** Horário de Brasília (UTC-3, sem horário de verão desde 2019), 60 s no passado. */
export function dhEmiAgora(agora = new Date()): string {
  const t = new Date(agora.getTime() - 60_000 - 3 * 3600_000);
  return t.toISOString().slice(0, 19) + "-03:00";
}

/** O que falta na configuração da empresa para poder emitir. */
export function problemasConfig(c: ConfigNacional): string[] {
  const p: string[] = [];
  if (dig(c.cnpj).length !== 14) p.push("CNPJ");
  if (dig(c.cLocEmi).length !== 7) p.push("código IBGE do município (7 dígitos)");
  if (dig(c.cTribNac).length !== 6) p.push("código de tributação nacional (6 dígitos)");
  if (!(Number(c.serie) >= 1 && Number(c.serie) <= 49999)) p.push("série da DPS (1 a 49999)");
  if (c.opSimpNac === 3 && !(c.pTotTribSN > 0)) p.push("% aproximado de tributos do Simples");
  return p;
}

/** Problemas que a Sefin recusaria — barrados antes de enviar. */
export function validarNac(n: NotaNac, hoje: string, cnpjPrestador: string = PHD_NACIONAL.cnpj): string[] {
  const p: string[] = [];
  const t = n.tomador;
  const doc = dig(t.cpf_cnpj);
  // Sem documento = consumidor final não identificado: a DPS sai sem <toma>.
  if (doc.length !== 0 && doc.length !== 11 && doc.length !== 14) p.push("CPF/CNPJ do tomador inválido");
  if (doc === cnpjPrestador) p.push("Tomador igual ao prestador");
  if (doc.length > 0 && !t.razao_social.trim()) p.push("Nome do tomador vazio");
  if (doc.length === 14) {
    if (dig(t.cep).length !== 8) p.push("CEP do tomador inválido");
    if (dig(t.ibge).length !== 7) p.push("Código IBGE do município do tomador não encontrado");
    if (!t.logradouro.trim()) p.push("Logradouro do tomador vazio");
    if (!t.bairro.trim()) p.push("Bairro do tomador vazio");
  }
  if (!(n.valor > 0)) p.push("Valor inválido");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(n.dCompet) || n.dCompet < "2000-01-01") p.push("Competência inválida");
  else if (n.dCompet > hoje) p.push("Competência no futuro");
  if (!n.descricao.trim()) p.push("Descrição do serviço vazia");
  return p;
}

/** DPS 1.01 numa linha só (sem espaços entre tags, para não mudar o digest). */
export function montarDps(n: NotaNac, c: ConfigNacional, dhEmi: string): { id: string; xml: string } {
  const serie = n.serie ?? c.serie;
  const id = idDps({ ...c, serie }, n.nDPS);
  const t = n.tomador;
  const doc = dig(t.cpf_cnpj);
  const lgr = [t.tipo_logradouro, t.logradouro].filter(Boolean).join(" ");
  const tomaDoc = doc.length === 11 ? `<CPF>${doc}</CPF>` : `<CNPJ>${doc}</CNPJ>`;
  const im = dig(t.inscricao_municipal) ? `<IM>${txt(t.inscricao_municipal, 15)}</IM>` : "";
  const end = dig(t.cep).length === 8 && dig(t.ibge).length === 7
    ? `<end><endNac><cMun>${dig(t.ibge)}</cMun><CEP>${dig(t.cep)}</CEP></endNac><xLgr>${txt(lgr, 255)}</xLgr><nro>${txt(t.numero || "S/N", 60)}</nro>`
      + (t.complemento.trim() ? `<xCpl>${txt(t.complemento, 156)}</xCpl>` : "") + `<xBairro>${txt(t.bairro, 60)}</xBairro></end>`
    : "";
  const email = t.email && t.email.length <= 80 ? `<email>${txt(t.email, 80)}</email>` : "";
  const info = n.infoCompl.trim() ? `<infoCompl><xInfComp>${txt(n.infoCompl, 2000)}</xInfComp></infoCompl>` : "";

  const xml = `<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infDPS Id="${id}">`
    + `<tpAmb>${c.ambiente}</tpAmb><dhEmi>${dhEmi}</dhEmi><verAplic>${txt(c.verAplic, 20)}</verAplic>`
    + `<serie>${Number(serie)}</serie><nDPS>${n.nDPS}</nDPS><dCompet>${n.dCompet}</dCompet>`
    + `<tpEmit>1</tpEmit><cLocEmi>${c.cLocEmi}</cLocEmi>`
    + `<prest><CNPJ>${c.cnpj}</CNPJ>${c.im ? `<IM>${c.im}</IM>` : ""}<regTrib><opSimpNac>${c.opSimpNac}</opSimpNac>${c.opSimpNac === 3 ? "<regApTribSN>1</regApTribSN>" : ""}<regEspTrib>0</regEspTrib></regTrib></prest>`
    + (doc ? `<toma>${tomaDoc}${im}<xNome>${txt(t.razao_social, 300)}</xNome>${end}${email}</toma>` : "")
    + `<serv><locPrest><cLocPrestacao>${c.cLocEmi}</cLocPrestacao></locPrest>`
    + `<cServ><cTribNac>${c.cTribNac}</cTribNac><xDescServ>${txt(n.descricao, 2000)}</xDescServ>${dig(c.cNBS).length === 9 ? `<cNBS>${dig(c.cNBS)}</cNBS>` : ""}</cServ>${info}</serv>`
    + `<valores><vServPrest><vServ>${n.valor.toFixed(2)}</vServ></vServPrest>`
    + `<trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun>`
    + (c.opSimpNac === 3 ? `<totTrib><pTotTribSN>${c.pTotTribSN.toFixed(2)}</pTotTribSN></totTrib>` : `<totTrib><indTotTrib>0</indTotTrib></totTrib>`) + `</trib></valores>`
    + `</infDPS></DPS>`;
  return { id, xml };
}

export interface ErroSefin { codigo: string; descricao: string; complemento?: string }

/** Resposta do POST /nfse (aceita camelCase e PascalCase). */
export function lerRespostaSefin(corpo: unknown): { chave: string | null; nfseB64: string | null; erros: ErroSefin[]; alertas: unknown } {
  const o = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  const pega = (...k: string[]) => { for (const x of k) if (o[x] != null) return o[x]; return null; };
  const brutos = (pega("erros", "Erros", "erro", "Erro") ?? []) as unknown;
  const lista = Array.isArray(brutos) ? brutos : brutos ? [brutos] : [];
  const erros = lista.map((e) => {
    const r = (e ?? {}) as Record<string, unknown>;
    return {
      codigo: String(r.codigo ?? r.Codigo ?? ""),
      descricao: String(r.descricao ?? r.Descricao ?? r.mensagem ?? ""),
      complemento: r.complemento != null || r.Complemento != null ? String(r.complemento ?? r.Complemento) : undefined,
    };
  });
  return {
    chave: (pega("chaveAcesso", "ChaveAcesso") as string | null) ?? null,
    nfseB64: (pega("nfseXmlGZipB64", "NfseXmlGZipB64") as string | null) ?? null,
    erros,
    alertas: pega("alertas", "Alertas"),
  };
}

export function textoErros(e: ErroSefin[]): string {
  return e.map((x) => `[${x.codigo}] ${x.descricao}${x.complemento ? ` (${x.complemento})` : ""}`).join("; ");
}

function tag(xml: string, nome: string): string | null {
  const m = new RegExp(`<(?:[\\w-]+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nome}>`).exec(xml);
  return m ? m[1].trim() : null;
}

/** Campos da NFS-e devolvida (XML já descompactado). */
export function lerNfse(xml: string) {
  return {
    nNFSe: tag(xml, "nNFSe"),
    dhProc: tag(xml, "dhProc"),
    vLiq: tag(xml, "vLiq"),
    dCompet: tag(xml, "dCompet"),
  };
}
