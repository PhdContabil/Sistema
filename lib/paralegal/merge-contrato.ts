// Mail-merge de contratos — migrado verbatim da lógica de contrato-form.js do
// Paralegal System (montarVariaveis/aplicarVariaveis/dataExtenso/valorExtenso).
import type { EmpresaCadastroDetalhado, SocioContratoQuestor } from "../questor";

export function formatarCnpj(v: string | number | null | undefined): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length !== 14) return v ? String(v) : "";
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export function formatarCep(v: string | number | null | undefined): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length !== 8) return v ? String(v) : "";
  return d.replace(/(\d{5})(\d{3})/, "$1-$2");
}

export function formatarCpf(v: string | number | null | undefined): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length !== 11) return v ? String(v) : "";
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

const MESES_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function dataExtenso(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const partes = isoDate.split("-");
  if (partes.length !== 3) return isoDate;
  const [ano, mes, dia] = partes;
  return "São Paulo, " + parseInt(dia, 10) + " de " + MESES_PT[parseInt(mes, 10) - 1] + " de " + ano;
}

const UNI = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const DEZ19 = ["dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cem", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function centenaExtenso(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100), r = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (r > 0) {
    if (r < 10) partes.push(UNI[r]);
    else if (r < 20) partes.push(DEZ19[r - 10]);
    else {
      const dz = Math.floor(r / 10), u = r % 10;
      partes.push(u === 0 ? DEZENAS[dz] : DEZENAS[dz] + " e " + UNI[u]);
    }
  }
  return partes.join(" e ");
}

function inteiroExtenso(n: number): string {
  if (n === 0) return "zero";
  const milhoes = Math.floor(n / 1000000);
  const milhares = Math.floor((n % 1000000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (milhoes > 0) partes.push(milhoes === 1 ? "um milhão" : centenaExtenso(milhoes) + " milhões");
  if (milhares > 0) partes.push(milhares === 1 ? "mil" : centenaExtenso(milhares) + " mil");
  if (resto > 0) partes.push(centenaExtenso(resto));
  return partes.join(" e ");
}

export function valorExtenso(valor: string | number): string {
  const n = Number(valor) || 0;
  const inteiro = Math.floor(n);
  const centavos = Math.round((n - inteiro) * 100);
  let texto = inteiroExtenso(inteiro) + " " + (inteiro === 1 ? "real" : "reais");
  if (centavos > 0) texto += " e " + inteiroExtenso(centavos) + " " + (centavos === 1 ? "centavo" : "centavos");
  return texto;
}

export function formatarValorBrl(v: string | number | null | undefined): string {
  const n = Number(v);
  if (!v || isNaN(n)) return "";
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface ExtrasMerge {
  datacontrato?: string;
  valor1?: string;
  valorextenso?: string;
  n2valor?: string;
  "2valorextenso"?: string;
}

export function montarVariaveis(d: EmpresaCadastroDetalhado, extras: ExtrasMerge): Record<string, string> {
  const socio: SocioContratoQuestor = (d.socios || d.quadrosocietario || [])[0] || {};
  const vars: Record<string, string> = {
    nomecliente: d.nomeempresa || d.nome || "",
    tipologradouro: d.tipologradouro || "",
    endereco: d.enderecoestab || d.endereco || "",
    numendereco: String(d.numenderestab ?? d.numero ?? ""),
    complemento: d.complenderestab || d.complemento || "",
    bairro: d.bairroenderestab || d.bairro || "",
    cidade: d.nomemunic || d.cidade || "",
    estado: d.siglaestado || d.uf || "",
    cep: formatarCep(d.cependerestab || d.cep),
    inscrfederal: formatarCnpj(d.inscrfederal || d.cnpj),
    nomesocio: socio.nomesocio || socio.nome || "",
    socioinscrfederal: formatarCpf(socio.inscrfederal || socio.cpf),
    dddsocio: String(socio.dddcelular || socio.dddfone || ""),
    fonesocio: String(socio.numerocelular || socio.numerofone || ""),
    emailsocio: socio.email || d.email || "",
  };
  return Object.assign(vars, extras);
}

export function aplicarVariaveis(texto: string, vars: Record<string, string | undefined>): string {
  return texto.replace(/@([a-zA-Z0-9]+)/g, (match, chave: string) => {
    const k = chave.toLowerCase();
    const v = vars[k];
    return v !== undefined && v !== null && v !== "" ? String(v) : match;
  });
}

/** Monta o texto final do contrato a partir do modelo + dados da empresa + valores informados. */
export function gerarTextoContrato(
  conteudo: string,
  empresa: EmpresaCadastroDetalhado,
  opts: { dataIso: string; valor1?: string; valor2?: string }
): string {
  const extras: ExtrasMerge = {
    datacontrato: dataExtenso(opts.dataIso),
    valor1: formatarValorBrl(opts.valor1),
    valorextenso: opts.valor1 ? valorExtenso(opts.valor1) : "",
    n2valor: formatarValorBrl(opts.valor2),
    "2valorextenso": opts.valor2 ? valorExtenso(opts.valor2) : "",
  };
  const vars = montarVariaveis(empresa, extras);
  return aplicarVariaveis(conteudo, vars);
}
