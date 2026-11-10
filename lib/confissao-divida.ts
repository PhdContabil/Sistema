// Termo de Confissão de Dívida (Financeiro): regras puras, sem dependências,
// para a tela (prévia) e o PDF saírem do MESMO texto e poderem ser testadas.
//
// Os boletos em aberto são digitados na tela por enquanto (copiados do
// relatório "Inadimplentes e Contas a Receber" do Questor Financeiro): a API
// do Questor ainda não tem rota de títulos em aberto.

export const CREDOR = {
  razao: "PHD CONTABIL LTDA ME",
  cnpj: "11.274.011/0001-86",
  endereco: "Rua Adolfino Arruda Castanho, nº 153, Jd. Bontempo – Taboão da Serra – São Paulo",
  cidade: "São Paulo",
  assinatura: "Credor - PHD CONTABIL LTDA ME",
} as const;

export interface LinhaBoleto {
  id: string;
  descricao: string;
  /** AAAA-MM */
  competencia: string;
  /** Texto digitado, ex.: "3.417,31" */
  valor: string;
}

export interface EmpresaDoTermo {
  codigoempresa: number;
  nome: string;
  cnpj: string | null;
  linhas: LinhaBoleto[];
}

export interface Devedor {
  nome: string;
  nacionalidade: string;
  profissao: string;
  endereco: string;
}

export interface EntradaTermo {
  empresas: EmpresaDoTermo[];
  /** Entrada em % (0 a 100) */
  pct: number;
  parcelas: number;
  devedor: Devedor;
  testemunhas: [string, string];
  /** AAAA-MM-DD */
  dataIso: string;
}

export type BlocoTermo =
  | { t: "title" | "p" | "co" | "li" | "tot" | "dt"; text: string }
  | { t: "sign"; l: string; r: string };

/** "3.417,31", "3417,31", "3417.31", "R$ 490,04" -> centavos. Inválido ou <= 0 -> 0. */
export function paraCentavos(txt: string | null | undefined): number {
  let s = String(txt ?? "").replace(/R\$|\s/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (!/^\d+\.\d{1,2}$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

export function formatBRL(centavos: number): string {
  return "R$ " + (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function competenciaValida(c: string | null | undefined): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(c ?? "");
}

export function formatarCompetencia(c: string): string {
  return c.slice(5, 7) + "/" + c.slice(0, 4);
}

const indiceCompetencia = (c: string) => parseInt(c.slice(0, 4), 10) * 12 + parseInt(c.slice(5, 7), 10);

/** Linhas completas (competência válida e valor > 0): só elas entram no termo. */
export function linhasValidas(linhas: LinhaBoleto[]): LinhaBoleto[] {
  return linhas.filter((l) => competenciaValida(l.competencia) && paraCentavos(l.valor) > 0);
}

/** "02/2026 à 07/2026" (meses seguidos), "06/2026" (um mês) ou "02/2026, 04/2026 e 07/2026". */
export function descreverCompetencias(linhas: LinhaBoleto[]): string {
  const comps = [...new Set(linhas.map((l) => l.competencia))].sort();
  if (comps.length === 1) return formatarCompetencia(comps[0]);
  const seguidos = comps.every((c, i) => i === 0 || indiceCompetencia(c) - indiceCompetencia(comps[i - 1]) === 1);
  if (seguidos) return formatarCompetencia(comps[0]) + " à " + formatarCompetencia(comps[comps.length - 1]);
  const f = comps.map(formatarCompetencia);
  return f.slice(0, -1).join(", ") + " e " + f[f.length - 1];
}

export interface Acordo {
  total: number;
  pct: number;
  parcelas: number;
  entrada: number;
  saldo: number;
  parcela: number;
  ultima: number;
}

/**
 * Entrada arredonda para BAIXO e a parcela para CIMA; a última parcela
 * absorve a diferença para o saldo fechar exato.
 */
export function calcularAcordo(totalCentavos: number, pctEntrada: number, nParcelas: number): Acordo {
  const pct = Math.min(100, Math.max(0, Number.isFinite(pctEntrada) ? pctEntrada : 0));
  const parcelas = Math.max(1, Math.floor(Number.isFinite(nParcelas) ? nParcelas : 1));
  const entrada = Math.floor((totalCentavos * pct) / 100);
  const saldo = totalCentavos - entrada;
  const parcela = Math.ceil(saldo / parcelas);
  const ultima = saldo - parcela * (parcelas - 1);
  return { total: totalCentavos, pct, parcelas, entrada, saldo, parcela, ultima };
}

export function totalDasEmpresas(empresas: EmpresaDoTermo[]): number {
  return empresas.reduce((s, e) => s + linhasValidas(e.linhas).reduce((t, l) => t + paraCentavos(l.valor), 0), 0);
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** "3 de Novembro de 2026" */
export function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

export function dataDeHoje(agora = new Date()): string {
  return agora.getFullYear() + "-" + String(agora.getMonth() + 1).padStart(2, "0") + "-" + String(agora.getDate()).padStart(2, "0");
}

/** Texto do termo, em blocos (a tela desenha em HTML e o PDF em jsPDF). */
export function montarBlocosTermo(e: EntradaTermo): { blocos: BlocoTermo[]; acordo: Acordo } {
  const comBoletos = e.empresas.filter((x) => linhasValidas(x.linhas).length > 0);
  const total = totalDasEmpresas(e.empresas);
  const ac = calcularAcordo(total, e.pct, e.parcelas);
  const d = e.devedor;
  const nome = d.nome.trim() || "[nome do devedor]";
  const qualificacao = [nome, d.nacionalidade.trim(), d.profissao.trim()].filter(Boolean).join(", ");
  const endereco = d.endereco.trim() || "[endereço]";

  const B: BlocoTermo[] = [];
  B.push({ t: "title", text: "INSTRUMENTO PARTICULAR DE CONFISSÃO DE DÍVIDA" });
  B.push({
    t: "p",
    text:
      `Pelo presente Instrumento Particular de Confissão de Dívida, de um lado como Credor ${CREDOR.razao}, inscrito no CNPJ nº ${CREDOR.cnpj}, ` +
      `com endereço na ${CREDOR.endereco}, e de outro o Devedor, ${qualificacao}, residente e domiciliado(a) à ${endereco}, têm entre si acertado o seguinte:`,
  });
  B.push({
    t: "p",
    text: `O valor da dívida que o devedor confessa dever ao credor é de ${formatBRL(total)}, da qual o devedor assina uma Nota Promissória como garantia.`,
  });
  B.push({
    t: "p",
    text: `Boletos em aberto referentes à ${String(comBoletos.length).padStart(2, "0")}${comBoletos.length === 1 ? " empresa:" : " empresas:"}`,
  });
  for (const emp of comBoletos) {
    B.push({ t: "co", text: emp.nome });
    const grupos = new Map<string, LinhaBoleto[]>();
    for (const l of linhasValidas(emp.linhas)) {
      const desc = l.descricao.trim() || "Mensalidade";
      grupos.set(desc, [...(grupos.get(desc) ?? []), l]);
    }
    for (const [desc, ls] of grupos) {
      const sub = ls.reduce((s, l) => s + paraCentavos(l.valor), 0);
      B.push({ t: "li", text: `${desc} ${descreverCompetencias(ls)} – Total ${formatBRL(sub)}` });
    }
  }
  B.push({ t: "tot", text: `TOTALIZANDO ${formatBRL(total)}` });

  const quando = ac.ultima !== ac.parcela && ac.parcelas > 1 ? `, sendo a última no valor de ${formatBRL(ac.ultima)}` : "";
  const parcelasTxt = `${ac.parcelas} ${ac.parcelas === 1 ? "parcela" : "parcelas"} no valor de ${formatBRL(ac.parcela)}${quando}`;
  const acordoTxt =
    "A quitação da dívida ocorrerá com Acordo de Dívidas" +
    (ac.entrada > 0
      ? ` (entrada de ${ac.pct}%) no valor de ${formatBRL(ac.entrada)} e o saldo (${100 - ac.pct}% do valor) em ${parcelasTxt}`
      : `, em ${parcelasTxt}`) +
    ", somente após o pagamento dos boletos do acordo de dívidas consideramos a dívida quitada.";
  B.push({ t: "p", text: acordoTxt });
  B.push({ t: "p", text: "E, por estarem de acordo, assinam o presente instrumento em duas vias de igual teor, na presença de duas testemunhas." });
  B.push({ t: "dt", text: `${CREDOR.cidade}, ${dataPorExtenso(e.dataIso)}` });
  B.push({ t: "sign", l: CREDOR.assinatura, r: `Devedor - ${nome}` });
  B.push({
    t: "sign",
    l: `Testemunha – ${e.testemunhas[0].trim() || "________________"}`,
    r: `Testemunha – ${e.testemunhas[1].trim() || "________________"}`,
  });
  return { blocos: B, acordo: ac };
}

/** O que falta antes de gerar o PDF (vazio = pode gerar). */
export function pendenciasDoTermo(e: EntradaTermo): string[] {
  const p: string[] = [];
  if (e.empresas.length === 0) p.push("Marque pelo menos uma empresa.");
  else if (totalDasEmpresas(e.empresas) <= 0) p.push("Digite pelo menos um boleto com competência e valor.");
  if (!e.devedor.nome.trim()) p.push("Preencha o nome do devedor.");
  if (!e.devedor.endereco.trim()) p.push("Preencha o endereço do devedor.");
  for (const emp of e.empresas) {
    const incompletas = emp.linhas.filter((l) => (l.competencia || l.valor) && !(competenciaValida(l.competencia) && paraCentavos(l.valor) > 0)).length;
    if (incompletas > 0) {
      p.push(`${emp.nome}: ${incompletas} ${incompletas === 1 ? "linha incompleta (fica fora do termo)" : "linhas incompletas (ficam fora do termo)"}.`);
    }
  }
  return p;
}

/** Só o que BLOQUEIA o PDF (linhas incompletas são só aviso: ficam fora do termo). */
export function podeGerarTermo(e: EntradaTermo): boolean {
  return e.empresas.length > 0 && totalDasEmpresas(e.empresas) > 0 && !!e.devedor.nome.trim() && !!e.devedor.endereco.trim();
}
