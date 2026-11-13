// Painel Gerencial do Paralegal — regras de cálculo (puras, sem acesso a banco).
//
// Parte dos processos do Societário (tabelas processos + atividades) e devolve,
// por processo: quem está com ele, em que etapa está, quanto já foi feito, o que
// ainda falta e a situação dos prazos. A tela só desenha o que sai daqui.
//
// node --experimental-strip-types --test lib/paralegal/painel.test.ts

export interface AtividadeEntrada {
  id: number;
  name: string;
  responsible: string | null;
  situation: string | null;
  order: string;
  closed_in: string | null;
  deadline_in: string | null;
}

export interface ProcessoEntrada {
  id: number;
  name: string;
  status: string;
  started_in?: string | null;
  activities: AtividadeEntrada[];
}

export type Categoria = "atrasada" | "vence_2d" | "vence_7d" | "backlog" | "futura" | "sem_prazo";
export type Alerta = "atrasado" | "vence_2d" | "vence_7d" | "sem_pendencia" | "em_dia" | "backlog" | "sem_checklist";

export interface AtividadeAberta {
  id: number;
  ordem: string;
  nome: string;
  responsavel: string;
  situacao: string;
  prazo: string | null;
  dias: number | null;
  categoria: Categoria;
}

export interface ProcessoPainel {
  id: number;
  nome: string;
  status: string;
  responsavel: string;
  /** Texto escrito à mão no Societário ("05/11 - Aguardando pagamento"), se houver. */
  etapaManual: string;
  /** Primeira atividade que falta, na ordem do processo. */
  etapaAtual: string;
  etapaPrazo: string | null;
  falta: number;
  feitas: number;
  atrasadas: number;
  vence2d: number;
  vence7d: number;
  backlog: number;
  alerta: Alerta;
  iniciado: string | null;
  abertas: AtividadeAberta[];
}

/** Dias que uma atrasada ainda conta como alerta; além disso vira "backlog antigo". */
export const JANELA_ATRASO_DIAS = 30;
/** Antecedência do aviso, em dias. */
export const AVISO_DIAS = 2;
export const SEMANA_DIAS = 7;

export const STATUS_ENCERRADOS = ["CONCLUIDO", "CANCELADO", "ARQUIVO MORTO"];

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function chave(s: string): string {
  return semAcento(s).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Hoje no fuso do escritório, como AAAA-MM-DD. */
export function hojeSP(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

export function diasEntre(deAAAAMMDD: string, ateAAAAMMDD: string): number {
  const a = Date.UTC(+deAAAAMMDD.slice(0, 4), +deAAAAMMDD.slice(5, 7) - 1, +deAAAAMMDD.slice(8, 10));
  const b = Date.UTC(+ateAAAAMMDD.slice(0, 4), +ateAAAAMMDD.slice(5, 7) - 1, +ateAAAAMMDD.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/** Mesma pessoa escrita de formas diferentes (caixa, acento, Rafael/Rhafael). */
export function nomeResponsavel(bruto: string | null | undefined): string {
  const k = chave(bruto || "");
  if (!k) return "Sem responsável";
  if (k === "rafael santos" || k === "rhafael santos") return "Rhafael Santos";
  return k.split(" ").map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p)).join(" ")
    .replace("Julia Helena", "Júlia Helena").replace("Flavia", "Flavia");
}

export function processoAtivo(p: ProcessoEntrada): boolean {
  if (STATUS_ENCERRADOS.includes(semAcento(p.status || "").toUpperCase().trim())) return false;
  if (/\bteste\b/i.test(p.name || "")) return false;
  return true;
}

type Estado = "feita" | "nao_se_aplica" | "aberta";

export function estadoAtividade(a: AtividadeEntrada): Estado {
  const s = chave(a.situation || "");
  if (a.closed_in || /^conclu/.test(s) || s === "ok") return "feita";
  if (s === "nao se aplica" || s === "nao" || /^nao realizado/.test(s)) return "nao_se_aplica";
  return "aberta";
}

export function categoriaPrazo(prazo: string | null, hoje: string): { categoria: Categoria; dias: number | null } {
  if (!prazo) return { categoria: "sem_prazo", dias: null };
  const dias = diasEntre(hoje, prazo.slice(0, 10));
  if (dias < -JANELA_ATRASO_DIAS) return { categoria: "backlog", dias };
  if (dias < 0) return { categoria: "atrasada", dias };
  if (dias <= AVISO_DIAS) return { categoria: "vence_2d", dias };
  if (dias <= SEMANA_DIAS) return { categoria: "vence_7d", dias };
  return { categoria: "futura", dias };
}

/** Ordem natural das etapas: "04" < "04.01" < "10". */
export function compararOrdem(a: string, b: string): number {
  return (a || "").localeCompare(b || "", "pt-BR", { numeric: true });
}

export function montarPainel(
  processos: ProcessoEntrada[],
  etapasManuais: Record<string, string> = {},
  hoje: string = hojeSP(),
): ProcessoPainel[] {
  const saida: ProcessoPainel[] = [];
  for (const p of processos) {
    if (!processoAtivo(p)) continue;
    const todas = [...p.activities].sort((x, y) => compararOrdem(x.order, y.order) || x.id - y.id);
    let feitas = 0;
    const abertas: AtividadeAberta[] = [];
    for (const a of todas) {
      const e = estadoAtividade(a);
      if (e === "feita") feitas++;
      else if (e === "aberta") {
        const { categoria, dias } = categoriaPrazo(a.deadline_in, hoje);
        abertas.push({
          id: a.id, ordem: a.order || "", nome: a.name, responsavel: nomeResponsavel(a.responsible),
          situacao: a.situation || "Sem situação", prazo: a.deadline_in ? a.deadline_in.slice(0, 10) : null, dias, categoria,
        });
      }
    }
    const n = (c: Categoria) => abertas.filter((a) => a.categoria === c).length;
    const atrasadas = n("atrasada"), vence2d = n("vence_2d"), vence7d = n("vence_7d"), backlog = n("backlog");
    const atual = abertas[0];
    const ultima = todas[todas.length - 1];
    let alerta: Alerta;
    if (atrasadas) alerta = "atrasado";
    else if (vence2d) alerta = "vence_2d";
    else if (vence7d) alerta = "vence_7d";
    else if (backlog) alerta = "backlog";
    else if (abertas.length === 0 && feitas === 0) alerta = "sem_checklist";
    else if (abertas.length === 0) alerta = "sem_pendencia";
    else alerta = "em_dia";
    saida.push({
      id: p.id, nome: p.name, status: p.status,
      responsavel: atual ? atual.responsavel : nomeResponsavel(ultima?.responsible),
      etapaManual: etapasManuais[String(p.id)] || "",
      etapaAtual: atual ? atual.nome : "Sem atividade aberta",
      etapaPrazo: atual ? atual.prazo : null,
      falta: abertas.length, feitas, atrasadas, vence2d, vence7d, backlog, alerta,
      iniciado: p.started_in || null, abertas,
    });
  }
  return saida;
}

export interface Resumo {
  ativos: number;
  atrasados: number;
  vence2d: number;
  vence7d: number;
  prontos: number;
  semChecklist: number;
  faltam: number;
}

export function resumir(ps: ProcessoPainel[]): Resumo {
  const n = (a: Alerta) => ps.filter((p) => p.alerta === a).length;
  return {
    ativos: ps.length, atrasados: n("atrasado"), vence2d: n("vence_2d"), vence7d: n("vence_7d"),
    prontos: n("sem_pendencia"), semChecklist: n("sem_checklist"), faltam: ps.reduce((s, p) => s + p.falta, 0),
  };
}

export interface LinhaResponsavel {
  responsavel: string;
  processos: number;
  faltam: number;
  atrasado: number;
  vence2d: number;
  vence7d: number;
  backlog: number;
  outros: number;
}

export function porResponsavel(ps: ProcessoPainel[]): LinhaResponsavel[] {
  const m = new Map<string, LinhaResponsavel>();
  for (const p of ps) {
    const l = m.get(p.responsavel) || { responsavel: p.responsavel, processos: 0, faltam: 0, atrasado: 0, vence2d: 0, vence7d: 0, backlog: 0, outros: 0 };
    l.processos++; l.faltam += p.falta;
    if (p.alerta === "atrasado") l.atrasado++;
    else if (p.alerta === "vence_2d") l.vence2d++;
    else if (p.alerta === "vence_7d") l.vence7d++;
    else if (p.alerta === "backlog") l.backlog++;
    else l.outros++;
    m.set(p.responsavel, l);
  }
  return [...m.values()].sort((a, b) => b.processos - a.processos || a.responsavel.localeCompare(b.responsavel, "pt-BR"));
}

export function porStatus(ps: ProcessoPainel[]): { status: string; total: number }[] {
  const m = new Map<string, number>();
  for (const p of ps) m.set(p.status, (m.get(p.status) || 0) + 1);
  return [...m.entries()].map(([status, total]) => ({ status, total })).sort((a, b) => b.total - a.total);
}
