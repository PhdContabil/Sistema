// Emissão de NFS-e da PHD (Taboão da Serra, Simples Nacional) — partes puras.
//
// Porta do app Python `phd_nfse` (src/csv_parser.py, src/xml_builder_phd.py,
// src/client.py e scripts/baixar_pdfs.py). O XML e as regras de validação são
// os mesmos que já emitem em produção; mudou só a linguagem.
//
// SEM IMPORTS: roda direto no `node --test` com strip-types.

export interface Prestador {
  cnpj: string;
  dataAdesaoSimples: string; // DD/MM/AAAA
  aliquotaIss: number;       // 5.00
  cnae: string;
  codigoServico: string;
  ctn: string;
  nbs: string;
}

/** Dados fixos da PHD (eram o .env do app Python; não são segredo). */
export const PRESTADOR_PHD: Prestador = {
  cnpj: "11274011000186",
  dataAdesaoSimples: "23/10/2010",
  aliquotaIss: 5,
  cnae: "6920601",
  codigoServico: "17.19",
  ctn: "171901000",
  nbs: "113022100",
};

export interface Tomador {
  cpf_cnpj: string;
  razao_social: string;
  tipo_pessoa: "F" | "J";
  inscricao_municipal: string;
  email: string;
  tipo_logradouro: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
}

export interface NotaNfse {
  rps_serie: string;
  rps_numero: number;
  data_prestacao: string; // YYYY-MM-DD
  valor: number;
  descricao: string;
  codigo_servico: string;
  observacao: string;
  tomador: Tomador;
}

/** Linha como vem do CSV do nSQL ou da API do Questor (chaves em minúsculas). */
export type LinhaBruta = Record<string, string | number | boolean | null | undefined>;

// ------------------------------------------------------------ utilitários

export function semAcentos(t: string): string {
  return (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function soDigitos(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

/** "1.614,15" | "1614,15" | "1614.15" | 1614.15 -> 1614.15 */
export function converterValor(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").trim();
  if (!s) return null;
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "16/04/2026" | "2026-04-16" | "16-04-2026" | "16/04/26" -> "2026-04-16" */
export function converterData(v: unknown): string | null {
  const s = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(s);
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

export function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** 552.31 -> "552,31" (como a prefeitura espera). */
export function decimalBR(n: number, casas = 2): string {
  return (Math.round(n * 10 ** casas) / 10 ** casas).toFixed(casas).replace(".", ",");
}

export function escaparXml(t: string): string {
  return (t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
;
}

function desescaparXml(t: string): string {
  return t.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** Primeiro e-mail válido de um campo que às vezes vem com texto ou vários e-mails. */
export function emailPrincipal(t: unknown): string {
  const m = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(String(t ?? ""));
  return m ? m[0] : "";
}

const TIPOS: Record<string, string> = {
  "RUA": "Rua", "R": "Rua", "R.": "Rua",
  "AV": "Avenida", "AV.": "Avenida", "AVENIDA": "Avenida",
  "ALAMEDA": "Alameda", "AL": "Alameda", "AL.": "Alameda",
  "PRAÇA": "Praça", "PRACA": "Praça", "PÇA": "Praça", "PÇA.": "Praça",
  "TRAVESSA": "Travessa", "TV": "Travessa", "TV.": "Travessa",
  "RODOVIA": "Rodovia", "ROD": "Rodovia", "ROD.": "Rodovia",
  "ESTRADA": "Estrada", "EST": "Estrada", "EST.": "Estrada",
};

/** Tipo de logradouro explícito ou grudado no início ("R.VIDAL RAMOS" -> Rua, "VIDAL RAMOS"). */
export function tipoLogradouro(tipo: string, logradouro: string): [string, string] {
  const t = (tipo ?? "").trim().toUpperCase();
  const log = (logradouro ?? "").trim();
  if (t && TIPOS[t]) return [TIPOS[t], log];
  for (const tam of [10, 8, 7, 6, 5, 4, 3, 2, 1]) {
    if (log.length <= tam) continue;
    const prefixo = log.slice(0, tam).toUpperCase().trim();
    for (const v of [prefixo, prefixo.replace(/\.$/, ""), prefixo + "."]) {
      if (!TIPOS[v]) continue;
      const prox = log.slice(tam, tam + 1);
      if (prox === " " || prox === "." || prox === "") {
        const resto = log.slice(tam).replace(/^[ .]+/, "");
        if (resto) return [TIPOS[v], resto];
      }
    }
  }
  return ["Rua", log];
}

function validarCpf(c: string): boolean {
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

function validarCnpj(c: string): boolean {
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (pesos: number[]) => {
    const s = pesos.reduce((t, p, i) => t + Number(c[i]) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(c[12])
    && dv([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(c[13]);
}

// ------------------------------------------------------- linha -> nota

function campo(l: LinhaBruta, nome: string): string {
  const v = l[nome] ?? l[nome.toUpperCase()];
  return v == null ? "" : String(v).trim();
}

/**
 * Valida e normaliza uma linha (CSV ou API). Devolve a nota e a lista de
 * problemas; com problema a nota não é emitida (igual ao app Python).
 */
export function linhaParaNota(l: LinhaBruta, prestador: Prestador = PRESTADOR_PHD): { nota: NotaNfse; problemas: string[] } {
  const problemas: string[] = [];

  const serie = campo(l, "rps_serie") || "NF";
  const numero = Number(soDigitos(campo(l, "rps_numero")));
  if (!numero) problemas.push(`RPS inválido: "${campo(l, "rps_numero")}"`);

  const razao = campo(l, "razao_social");
  if (!razao) problemas.push("Razão social vazia");

  const doc = soDigitos(campo(l, "cpf_cnpj"));
  if (!doc) problemas.push("CPF/CNPJ vazio");
  else if (/^0+$/.test(doc)) problemas.push("CPF/CNPJ é tudo zero (Clientes Diversos do Questor)");
  else if (doc.length === 11 ? !validarCpf(doc) : doc.length === 14 ? !validarCnpj(doc) : true) {
    problemas.push(`CPF/CNPJ inválido: ${doc}`);
  }
  const tp = campo(l, "tipo_pessoa").toUpperCase();
  const tipoPessoa: "F" | "J" = ["F", "1", "PF"].includes(tp) ? "F" : ["J", "2", "PJ"].includes(tp) ? "J" : doc.length === 11 ? "F" : "J";

  const [tipoLog, logradouro] = tipoLogradouro(campo(l, "tipo_logradouro"), campo(l, "logradouro"));
  if (!logradouro) problemas.push("Logradouro vazio");
  let numeroEnd = campo(l, "numero_endereco");
  if (!numeroEnd || numeroEnd === "0" || numeroEnd === "00") numeroEnd = "S/N";
  const bairro = campo(l, "bairro");
  if (!bairro) problemas.push("Bairro vazio");
  const municipio = semAcentos(campo(l, "municipio")).toUpperCase();
  if (!municipio) problemas.push("Município vazio");
  const uf = campo(l, "uf").toUpperCase();
  if (uf.length !== 2) problemas.push(`UF inválida: "${uf}"`);
  let cep = soDigitos(campo(l, "cep"));
  if (cep.length === 7) cep = "0" + cep; // exportação numérica perde o zero à esquerda
  if (cep.length !== 8) problemas.push(`CEP inválido: "${campo(l, "cep")}"`);
  else if (/^0+$/.test(cep)) problemas.push("CEP é tudo zero");

  const valor = converterValor(l.valor_nota ?? l.VALOR_NOTA) ?? 0;
  if (!(valor > 0)) problemas.push(`Valor inválido: "${campo(l, "valor_nota")}"`);
  const data = converterData(campo(l, "data_prestacao")) ?? new Date().toISOString().slice(0, 10);
  const descricao = campo(l, "descricao_servico");
  if (!descricao) problemas.push("Descrição do serviço vazia");
  if (l.cancelado === true) problemas.push("RPS cancelado no Questor");
  // Rota da API traz o número da NFS-e quando o Questor já registrou uma: não emitir de novo.
  if (campo(l, "nfse_numero")) problemas.push(`Já tem NFS-e ${campo(l, "nfse_numero")} registrada no Questor`);

  return {
    problemas,
    nota: {
      rps_serie: serie,
      rps_numero: numero,
      data_prestacao: data,
      valor: Math.round(valor * 100) / 100,
      descricao,
      codigo_servico: campo(l, "codigo_servico") || prestador.codigoServico,
      observacao: campo(l, "observacao_nota"),
      tomador: {
        cpf_cnpj: doc, razao_social: razao, tipo_pessoa: tipoPessoa,
        inscricao_municipal: campo(l, "inscricao_municipal"),
        email: emailPrincipal(campo(l, "email")),
        tipo_logradouro: tipoLog, logradouro, numero: numeroEnd,
        complemento: campo(l, "complemento"), bairro, municipio, uf, cep,
      },
    },
  };
}

/** CSV do nSQL (delimitador ; ou , com aspas) -> linhas com chaves minúsculas. */
export function lerCsv(texto: string): LinhaBruta[] {
  const t = texto.replace(/^﻿/, "");
  const primeira = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let atual: string[] = [], campoAtual = "", aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campoAtual += '"'; i++; }
      else if (c === '"') aspas = false;
      else campoAtual += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { atual.push(campoAtual); campoAtual = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      atual.push(campoAtual); campoAtual = "";
      if (atual.some((x) => x.trim())) linhas.push(atual);
      atual = [];
    } else campoAtual += c;
  }
  atual.push(campoAtual);
  if (atual.some((x) => x.trim())) linhas.push(atual);
  const [cab, ...dados] = linhas;
  if (!cab) return [];
  const chaves = cab.map((h) => h.trim().toLowerCase());
  return dados.map((d) => Object.fromEntries(chaves.map((k, i) => [k, d[i] ?? ""])));
}

// --------------------------------------------------------------- XML RPS

/** Bloco <SDTRPS> do layout 4.0 (o mesmo XML que o app Python já emite). */
export function montarSdtrps(n: NotaNfse, p: Prestador = PRESTADOR_PHD): string {
  const t = n.tomador;
  const [ano, mes] = n.data_prestacao.split("-");
  const dataEmi = dataBR(n.data_prestacao);
  const valor = decimalBR(n.valor);
  const aliq = decimalBR(p.aliquotaIss);
  const iss = decimalBR((n.valor * p.aliquotaIss) / 100);
  const e = escaparXml;
  return `<SDTRPS xmlns="NFe">
<Ano>${ano}</Ano>
<Mes>${mes}</Mes>
<CPFCNPJ>${p.cnpj}</CPFCNPJ>
<DTIni>${dataEmi}</DTIni>
<DTFin>${dataEmi}</DTFin>
<TipoTrib>4</TipoTrib>
<DtAdeSN>${p.dataAdesaoSimples}</DtAdeSN>
<AlqIssSN_IP>${aliq}</AlqIssSN_IP>
<RegApTribSN>1</RegApTribSN>
<TribTpSusp />
<TribProcSusp />
<Versao>4.00</Versao>
<Reg20>
<Reg20Item>
<TipoNFS>RPS</TipoNFS>
<NumRps>${n.rps_numero}</NumRps>
<SerRps>${e(n.rps_serie)}</SerRps>
<DtEmi>${dataEmi}</DtEmi>
<RetFonte>NAO</RetFonte>
<CodSrv>${e(n.codigo_servico)}</CodSrv>
<DiscrSrv>${e(n.descricao)}</DiscrSrv>
<VlNFS>${valor}</VlNFS>
<VlDed>0,00</VlDed>
<DiscrDed />
<VlBasCalc>${valor}</VlBasCalc>
<AlqIss>${aliq}</AlqIss>
<VlIss>${iss}</VlIss>
<VlIssRet>0,00</VlIssRet>
<CpfCnpTom>${t.cpf_cnpj}</CpfCnpTom>
<RazSocTom>${e(t.razao_social)}</RazSocTom>
<TipoLogtom>${e(t.tipo_logradouro)}</TipoLogtom>
<LogTom>${e(t.logradouro)}</LogTom>
<NumEndTom>${e(t.numero)}</NumEndTom>
<ComplEndTom>${e(t.complemento)}</ComplEndTom>
<BairroTom>${e(t.bairro)}</BairroTom>
<MunTom>${e(t.municipio)}</MunTom>
<SiglaUFTom>${t.uf}</SiglaUFTom>
<CepTom>${t.cep}</CepTom>
<Telefone></Telefone>
<InscricaoMunicipal>${e(t.inscricao_municipal)}</InscricaoMunicipal>
<TipoLogLocPre />
<LogLocPre />
<NumEndLocPre />
<ComplEndLocPre />
<BairroLocPre />
<MunLocPre />
<SiglaUFLocpre />
<CepLocPre />
<Email1>${e(t.email)}</Email1>
<Email2 />
<Email3 />
<MoedaTrnExt />
<ValTrnExt />
<Reg30 />
<Reg40>
<Reg40Item>
<SiglaCpoAdc>Srv_CNAE</SiglaCpoAdc>
<ConteudoCpoAdc>${p.cnae}</ConteudoCpoAdc>
</Reg40Item>
<Reg40Item>
<SiglaCpoAdc>Srv_CTN</SiglaCpoAdc>
<ConteudoCpoAdc>${p.ctn}</ConteudoCpoAdc>
</Reg40Item>
<Reg40Item>
<SiglaCpoAdc>Srv_NBS</SiglaCpoAdc>
<ConteudoCpoAdc>${p.nbs}</ConteudoCpoAdc>
</Reg40Item>
<Reg40Item>
<SiglaCpoAdc>Srv_AnexoSN</SiglaCpoAdc>
<ConteudoCpoAdc>III</ConteudoCpoAdc>
</Reg40Item>
</Reg40>
<Reg50 />
<Reg60_RTC>
<Finalidade>0</Finalidade>
<IndConsFin>NAO</IndConsFin>
<IndDest>SIM</IndDest>
<IndOpeOne>SIM</IndOpeOne>
<IndCodOpe>100301</IndCodOpe>
<VlReeRepRes />
<gIBSCBS>
<CST>200</CST>
<CClassTrib>200052</CClassTrib>
<CCodCredPres />
</gIBSCBS>
</Reg60_RTC>
</Reg20Item>
</Reg20>
<Reg90>
<QtdRegNormal>1</QtdRegNormal>
<ValorNFS>${valor}</ValorNFS>
<ValorISS>${iss}</ValorISS>
<ValorDed>0,00</ValorDed>
<ValorIssRetTom>0,00</ValorIssRetTom>
<QtdReg30>0</QtdReg30>
<ValorTributos>0,00</ValorTributos>
<QtdReg40>4</QtdReg40>
<QtdReg50>0</QtdReg50>
</Reg90>
</SDTRPS>`;
}

// ---------------------------------------------------------- respostas

export interface Mensagem { id: string; tipo: number; descricao: string }
export interface Resposta { retorno: boolean; protocolo: string; mensagens: Mensagem[] }

function tag(xml: string, nome: string): string | null {
  const m = new RegExp(`<(?:[\\w-]+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nome}>`).exec(xml);
  return m ? m[1].trim() : null;
}

/** Retorno, protocolo e mensagens de PROCESSARPS / VERFICARPS. */
export function lerResposta(xml: string): Resposta {
  const mensagens: Mensagem[] = [];
  const re = /<(?:[\w-]+:)?Message(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?Message>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    mensagens.push({
      id: tag(m[1], "Id") ?? "",
      tipo: Number(tag(m[1], "Type") ?? 0) || 0,
      descricao: desescaparXml(tag(m[1], "Description") ?? ""),
    });
  }
  return {
    retorno: (tag(xml, "Retorno") ?? "").toLowerCase() === "true",
    protocolo: tag(xml, "Protocolo") ?? "",
    mensagens,
  };
}

export function textoMensagens(r: Resposta): string {
  return r.mensagens.map((x) => `[${x.id}/${x.tipo}] ${x.descricao}`).join("; ");
}

/** "Sequência do RPS... Último RPS Processado/Cancelado: 13402" -> (true, 13402). */
export function erroDeSequencia(erro: string): { sequencia: boolean; ultimo: number | null } {
  const e = erro.toLowerCase();
  if (!e.includes("sequ") || !e.includes("rps")) return { sequencia: false, ultimo: null };
  const m = /ltimo RPS Processado\/Cancelado:\s*(\d+)/i.exec(erro);
  return { sequencia: true, ultimo: m ? Number(m[1]) : null };
}

export interface DadosImpressao {
  link: string | null;
  numero_nota: string | null;
  serie_nota: string | null;
  codigo_verificacao: string | null;
  data_emissao: string | null;
  mensagem: string | null;
}

/** Resposta do IMPRESSAOLINKNFSE: o XML de saída vem escapado dentro de <Xml_saida>. */
export function lerImpressao(xml: string): DadosImpressao | null {
  const saida = tag(xml, "Xml_saida");
  if (!saida) return null;
  const inner = desescaparXml(saida);
  const g = (n: string) => { const v = tag(inner, n); return v ? desescaparXml(v) : null; };
  const numero = g("NumNf");
  return {
    link: g("LinkImpressao"),
    numero_nota: numero && numero !== "0" ? numero : null,
    serie_nota: g("SerNf"),
    codigo_verificacao: g("CodVernf"),
    data_emissao: g("DtEmiNf"),
    mensagem: g("Description"),
  };
}

/** Competências para procurar o PDF: a da prestação, a anterior e a atual. */
export function competenciasParaPdf(dataPrestacao: string, hoje: string): [number, number][] {
  const [a, m] = dataPrestacao.split("-").map(Number);
  const lista: [number, number][] = [[m, a], m === 1 ? [12, a - 1] : [m - 1, a]];
  const [ha, hm] = hoje.split("-").map(Number);
  if (!lista.some(([mm, aa]) => mm === hm && aa === ha)) lista.push([hm, ha]);
  return lista;
}

/** "05/11/2026 17:30:12" | "05/11/2026" -> ISO 8601 com fuso de Brasília. */
export function dataHoraIso(br: string | null | undefined, padrao = new Date()): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec((br ?? "").trim());
  if (!m) return padrao.toISOString();
  return `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "12"}:${m[5] ?? "00"}:${m[6] ?? "00"}-03:00`;
}
