// NFS-e Padrão Nacional (XML do ADN) -> XML "InvoiceQuestorXmlDto", o único
// formato que o Importar NFS-e do Q-Drive (Questor Zen) aceita. Com o XML
// nacional puro o Zen responde "Cliente não possui licença NFS-e ativado".
// Modelo: arquivo "NFS-e Padrão-…" baixado do próprio Q-Drive. Sem imports.

const tag = (xml: string, t: string) => new RegExp(`<(?:\\w+:)?${t}>([^<]*)</(?:\\w+:)?${t}>`).exec(xml)?.[1]?.trim() ?? "";
const bloco = (xml: string, t: string) => new RegExp(`<(?:\\w+:)?${t}[\\s>][\\s\\S]*?</(?:\\w+:)?${t}>`).exec(xml)?.[0] ?? "";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** O XML nacional já vem com entidades escapadas; desfaz antes de escapar de novo. */
const txt = (s: string) => esc(s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"));
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const dataBR = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
const num = (v: string) => (Number(v || 0) || 0).toFixed(2);
/** UF pelos 2 primeiros dígitos do código IBGE do município. */
const UF_IBGE: Record<string, string> = { "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO", "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA", "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS", "50": "MS", "51": "MT", "52": "GO", "53": "DF" };
const ufDe = (cMun: string) => UF_IBGE[cMun.slice(0, 2)] ?? "";
const cep = (v: string) => (v ? v.replace(/\D/g, "").padStart(8, "0") : "");

/** "060101" (código de tributação nacional) -> "06.01" (item da LC 116). */
export function codigoServico(cTribNac: string): string {
  const d = cTribNac.replace(/\D/g, "");
  return d.length >= 4 ? `${d.slice(0, 2)}.${d.slice(2, 4)}` : d;
}

export function nacionalParaQuestor(xml: string, chave: string, cancelada = false): string {
  const inf = bloco(xml, "infNFSe") || xml;
  const dps = bloco(inf, "infDPS");
  const emit = bloco(inf, "emit"), endE = bloco(emit, "enderNac");
  const toma = bloco(dps, "toma"), endT = bloco(toma, "end");
  const valDps = bloco(dps, "valores");
  const valNfse = bloco(inf.replace(dps, ""), "valores");
  const tribMun = bloco(valDps, "tribMun");
  const retido = ["2", "3"].includes(tag(tribMun, "tpRetISSQN"));
  const vServ = tag(bloco(valDps, "vServPrest"), "vServ");
  const vIss = tag(valNfse, "vISSQN");
  const aliq = tag(valNfse, "pAliqAplic") || tag(tribMun, "pAliq");
  const ret = (t: string) => num(tag(valDps, t) || tag(valNfse, t));
  // PIS/COFINS só entram como retenção quando o tomador retém (tpRetPisCofins
  // "0"/"2" = não retidos); IR, CSLL e INSS (vRet*) já são sempre retenções.
  const tpPC = tag(bloco(valDps, "piscofins"), "tpRetPisCofins");
  const pisCofinsRetido = !!tpPC && !["0", "2"].includes(tpPC);
  const campos: [string, string][] = [
    ["PREFEITURA", semAcento(tag(inf, "xLocIncid") || tag(inf, "xLocPrestacao") || tag(inf, "xLocEmi"))],
    ["N_DA_NFSE", tag(inf, "nNFSe")],
    ["DATA_EMISSAO", dataBR(tag(dps, "dhEmi") || tag(inf, "dhProc"))],
    ["COMPETENCIA", dataBR(tag(dps, "dCompet"))],
    ["CODIGO_DE_VERIFICACAO", chave],
    ["NUMERO_DO_RPS", tag(dps, "nDPS") || "0"],
    ["LOCAL_DA_PRESTACAO", tag(dps, "cLocPrestacao") || tag(inf, "cLocIncid")],
    ["NOME_PRESTADOR", txt(tag(emit, "xNome"))],
    ["CPFCNPJ_PRESTADOR", tag(emit, "CNPJ") || tag(emit, "CPF")],
    ["INSC_MUNICIPAL", tag(emit, "IM")],
    ["CIDADE_PRESTADOR", tag(endE, "cMun")],
    ["ESTADO_PRESTADOR", tag(endE, "UF") || ufDe(tag(endE, "cMun"))],
    ["ENDERECO_PRESTADOR", txt(tag(endE, "xLgr"))],
    ["NO_ENDERECO_PRESTADOR", txt(tag(endE, "nro"))],
    ["CEP_PRESTADOR", cep(tag(endE, "CEP"))],
    ["COMPLEMENTO_PRESTADOR", txt(tag(endE, "xCpl"))],
    ["EMAIL_PRESTADOR", txt(tag(emit, "email"))],
    ["NOME_TOMADOR", txt(tag(toma, "xNome"))],
    ["CPFCNPJ_TOMADOR", tag(toma, "CNPJ") || tag(toma, "CPF")],
    ["INSC_MUNICIPAL_TOMADOR", tag(toma, "IM")],
    ["MUNICIPIO_TOMADOR", tag(endT, "cMun")],
    ["ESTADO_TOMADOR", tag(endT, "UF") || ufDe(tag(endT, "cMun"))],
    ["ENDERECO_E_CEP_TOMADOR", txt(tag(endT, "xLgr"))],
    ["NO_ENDERECO_TOMADOR", txt(tag(endT, "nro"))],
    ["CEP_TOMADOR", cep(tag(endT, "CEP"))],
    ["BAIRRO_TOMADOR", txt(tag(endT, "xBairro"))],
    ["COMPLEMENTO_TOMADOR", txt(tag(endT, "xCpl"))],
    ["CODIGO_SERVICO", codigoServico(tag(dps, "cTribNac"))],
    ["VL_PIS", pisCofinsRetido ? ret("vPis") : "0.00"],
    ["VL_COFINS", pisCofinsRetido ? ret("vCofins") : "0.00"],
    ["VL_CSLL", ret("vRetCSLL")],
    ["VL_IR", ret("vRetIRRF")],
    ["VL_INSS", ret("vRetCP")],
    ["VALOR_DOS_SERVICOS", num(vServ)],
    ["DESCONTO_INCONDICIONADO_VLS", ret("vDescIncond")],
    ["DESCONTO_CONDICIONADO", ret("vDescCond")],
    ["VALOR_LIQUIDO", num(tag(valNfse, "vLiq") || vServ)],
    ["NATUREZA_OPERACAO", "1"],
    ["DEDUCOES_PERMITIDAS_EM_LEI", ret("vDR")],
    ["BASE_ISS", num(tag(valNfse, "vBC") || vServ)],
    ["ALIQUOTA_ISS", num(aliq)],
    ["ISS_A_RETER", retido ? "1" : "2"],
    ["VL_ISS", num(vIss)],
    ["DISCRIMINACAO_DOS_SERVICOS", txt(tag(dps, "xDescServ"))],
    ["CANCELADO", cancelada ? "TRUE" : "FALSE"],
  ];
  return '<?xml version="1.0" encoding="utf-8"?>\n'
    + '<InvoiceQuestorXmlDto xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\n'
    + campos.map(([k, v]) => (v ? `  <${k}>${v}</${k}>` : `  <${k} />`)).join("\n")
    + "\n</InvoiceQuestorXmlDto>\n";
}
