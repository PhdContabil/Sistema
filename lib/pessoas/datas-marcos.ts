// Pessoas › Datas e Marcos — lógica pura (sem banco, sem rede).
//
// Aniversários, tempo de casa, formaturas, datas comemorativas e campanhas do
// mês são GERADOS a partir do cadastro para qualquer ano, em vez de gravados
// linha a linha em eventos_agenda. Assim a agenda não precisa de carga anual.
//
//   node --experimental-strip-types --test lib/pessoas/datas-marcos.test.ts
//
// Datas sempre como texto "AAAA-MM-DD": evita o deslocamento de fuso que o
// Date do JavaScript causa na virada do dia.

export interface PessoaDatas {
  pessoa_id: number;
  nome: string;
  /** Só tempo de casa e experiência exigem pessoa ativa; aniversário não. */
  ativo: boolean;
  data_nascimento: string | null;
  data_admissao: string | null;
  fim_experiencia: string | null;
}

export type RegraData = "anual" | "segundo_domingo" | "pascoa" | "mes" | "unica";

export interface DataComemorativa {
  id: number;
  titulo: string;
  tipo: string;
  regra: RegraData;
  mes: number | null;
  dia: number | null;
  data_unica: string | null;
  cor: string | null;
}

export interface Formatura {
  id?: number;
  pessoa_id: number;
  nome: string;
  curso: string;
  nivel: string;
  previsao: string;
}

/** Evento calculado (não vem de eventos_agenda). */
export interface EventoGerado {
  id: string;
  tipo: string;
  titulo: string;
  inicio: string;
  fim: string;
  detalhe: string | null;
  /** Marco de tempo de casa (1 ano e múltiplos de 5). */
  destaque?: boolean;
  /** Barra do mês inteiro de uma campanha. */
  campanha?: boolean;
  cor?: string;
}

export interface ContextoDatas {
  pessoas: PessoaDatas[];
  datas: DataComemorativa[];
  formaturas: Formatura[];
  /** Fim da experiência na agenda: só para quem é do RH. */
  incluirExperiencia?: boolean;
}

export const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const p2 = (n: number) => String(n).padStart(2, "0");
export const iso = (a: number, m: number, d: number) => `${a}-${p2(m)}-${p2(d)}`;

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** "AAAA-MM-DD" -> { a, m, d }. */
export function partes(data: string): { a: number; m: number; d: number } {
  return { a: Number(data.slice(0, 4)), m: Number(data.slice(5, 7)), d: Number(data.slice(8, 10)) };
}

/** Dia 29/02 cai em 28/02 nos anos que não são bissextos. */
function diaNoAno(ano: number, mes: number, dia: number): number {
  return Math.min(dia, diasNoMes(ano, mes));
}

/** Data de hoje em São Paulo, "AAAA-MM-DD". */
export function hojeSP(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export function somaDias(data: string, dias: number): string {
  const { a, m, d } = partes(data);
  const t = new Date(Date.UTC(a, m - 1, d) + dias * 86400000);
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): { mes: number; dia: number } {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { mes, dia };
}

/** Dia do mês do 2º domingo (Dia das Mães: maio; Dia dos Pais: agosto). */
export function segundoDomingo(ano: number, mes: number): number {
  const primeiroDow = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();
  return 1 + ((7 - primeiroDow) % 7) + 7;
}

/** Marco de tempo de casa: 1 ano e todo múltiplo de 5 (5, 10, 15, 20, 25…). */
export function ehMarco(anos: number): boolean {
  return anos === 1 || (anos > 0 && anos % 5 === 0);
}

export function rotuloAnos(anos: number): string {
  return anos === 1 ? "1 ano" : `${anos} anos`;
}

/** Data de uma regra num dado ano ("AAAA-MM-DD"), ou null se não cai nele. */
export function dataDaRegra(dc: DataComemorativa, ano: number): string | null {
  switch (dc.regra) {
    case "anual":
      return dc.mes && dc.dia ? iso(ano, dc.mes, diaNoAno(ano, dc.mes, dc.dia)) : null;
    case "segundo_domingo":
      return dc.mes ? iso(ano, dc.mes, segundoDomingo(ano, dc.mes)) : null;
    case "pascoa": {
      const p = pascoa(ano);
      return iso(ano, p.mes, p.dia);
    }
    case "unica":
      return dc.data_unica && partes(dc.data_unica).a === ano ? dc.data_unica : null;
    default:
      return null; // "mes" não tem um dia só
  }
}

/** Campanha do mês (barra do mês inteiro), se houver. */
export function campanhaDoMes(mes: number, datas: DataComemorativa[]): { titulo: string; cor: string } | null {
  const c = datas.find((d) => d.regra === "mes" && d.mes === mes);
  return c ? { titulo: c.titulo, cor: c.cor ?? "#64748b" } : null;
}

export interface AniversarianteMes { dia: number; nome: string }
export interface TempoDeCasaMes { dia: number; nome: string; anos: number; marco: boolean }

/** Aniversários de nascimento do mês, por dia e depois por nome. */
export function aniversariantesDoMes(ano: number, mes: number, pessoas: PessoaDatas[]): AniversarianteMes[] {
  const r: AniversarianteMes[] = [];
  for (const p of pessoas) {
    if (!p.data_nascimento) continue;
    const n = partes(p.data_nascimento);
    if (n.m === mes) r.push({ dia: diaNoAno(ano, mes, n.d), nome: p.nome });
  }
  return r.sort((x, y) => x.dia - y.dia || x.nome.localeCompare(y.nome, "pt-BR"));
}

/** Aniversários de empresa do mês (1 ano ou mais), só de pessoas ativas. */
export function tempoDeCasaDoMes(ano: number, mes: number, pessoas: PessoaDatas[]): TempoDeCasaMes[] {
  const r: TempoDeCasaMes[] = [];
  for (const p of pessoas) {
    if (!p.ativo || !p.data_admissao) continue;
    const ad = partes(p.data_admissao);
    const anos = ano - ad.a;
    if (ad.m === mes && anos >= 1) r.push({ dia: diaNoAno(ano, mes, ad.d), nome: p.nome, anos, marco: ehMarco(anos) });
  }
  return r.sort((x, y) => x.dia - y.dia || x.nome.localeCompare(y.nome, "pt-BR"));
}

/** Quem completa 90 dias de casa (fim da experiência) numa data exata. */
export function fimExperienciaEm(data: string, pessoas: PessoaDatas[]): PessoaDatas[] {
  return pessoas.filter((p) => p.ativo && p.fim_experiencia === data);
}

/** Quem está dentro dos 90 dias numa data (admitido, e o fim ainda não passou). */
export function emExperiencia(hoje: string, pessoas: PessoaDatas[]): PessoaDatas[] {
  return pessoas
    .filter((p) => p.ativo && p.data_admissao && p.fim_experiencia && p.data_admissao <= hoje && p.fim_experiencia >= hoje)
    .sort((x, y) => (x.fim_experiencia ?? "").localeCompare(y.fim_experiencia ?? ""));
}

function agrupaPorDia<T extends { dia: number }>(itens: T[]): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const i of itens) m.set(i.dia, [...(m.get(i.dia) ?? []), i]);
  return m;
}

/** Todos os eventos calculados de um mês. */
export function eventosDoMes(ano: number, mes: number, ctx: ContextoDatas): EventoGerado[] {
  const ev: EventoGerado[] = [];
  const ult = diasNoMes(ano, mes);

  // Campanha do mês inteiro (as de `mes` aparecem como barra).
  for (const d of ctx.datas) {
    if (d.regra === "mes" && d.mes === mes) {
      ev.push({
        id: `gen:camp:${d.id}:${ano}-${p2(mes)}`, tipo: d.tipo, titulo: d.titulo,
        inicio: iso(ano, mes, 1), fim: iso(ano, mes, ult), detalhe: null, campanha: true, cor: d.cor ?? undefined,
      });
    }
  }

  // Aniversários (um evento por dia, com todos os nomes).
  for (const [dia, lista] of agrupaPorDia(aniversariantesDoMes(ano, mes, ctx.pessoas))) {
    ev.push({
      id: `gen:aniv:${iso(ano, mes, dia)}`, tipo: "aniversario",
      titulo: `🎂 ${lista.map((x) => x.nome).join(", ")}`,
      inicio: iso(ano, mes, dia), fim: iso(ano, mes, dia), detalhe: "Aniversário",
    });
  }

  // Tempo de casa.
  for (const [dia, lista] of agrupaPorDia(tempoDeCasaDoMes(ano, mes, ctx.pessoas))) {
    ev.push({
      id: `gen:casa:${iso(ano, mes, dia)}`, tipo: "aniversario",
      titulo: `🏢 ${lista.map((x) => `${x.nome} (${rotuloAnos(x.anos)})`).join(", ")}`,
      inicio: iso(ano, mes, dia), fim: iso(ano, mes, dia), detalhe: "Tempo de casa",
      destaque: lista.some((x) => x.marco),
    });
  }

  // Datas comemorativas de um dia só.
  for (const d of ctx.datas) {
    const data = dataDaRegra(d, ano);
    if (data && partes(data).m === mes) {
      ev.push({ id: `gen:data:${d.id}:${data}`, tipo: d.tipo, titulo: d.titulo, inicio: data, fim: data, detalhe: null });
    }
  }

  // Formaturas previstas (aparecem no mês previsto).
  for (const f of ctx.formaturas) {
    const pv = partes(f.previsao);
    if (pv.a === ano && pv.m === mes) {
      ev.push({
        id: `gen:form:${f.pessoa_id}:${f.previsao}`, tipo: "outro",
        titulo: `🎓 Formatura: ${f.nome}`, inicio: iso(ano, mes, 1), fim: iso(ano, mes, 1),
        detalhe: `${f.nivel} em ${f.curso} (previsão ${p2(pv.m)}/${pv.a})`,
      });
    }
  }

  // Fim da experiência (só para o RH).
  if (ctx.incluirExperiencia) {
    for (const p of ctx.pessoas) {
      if (!p.ativo || !p.fim_experiencia) continue;
      const fe = partes(p.fim_experiencia);
      if (fe.a === ano && fe.m === mes) {
        ev.push({
          id: `gen:exp:${p.pessoa_id}:${p.fim_experiencia}`, tipo: "outro",
          titulo: `⏳ Fim da experiência: ${p.nome}`, inicio: p.fim_experiencia, fim: p.fim_experiencia,
          detalhe: "90 dias de casa",
        });
      }
    }
  }

  return ev.sort((x, y) => Number(Boolean(y.campanha)) - Number(Boolean(x.campanha)) || x.inicio.localeCompare(y.inicio));
}
