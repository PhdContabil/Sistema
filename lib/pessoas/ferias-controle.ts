// Controle de férias: período aquisitivo, data limite e sinal de programação.
// SEM IMPORTS: roda direto no `node --test` com strip-types.
//
// Três jeitos de as férias entrarem (pedido do Gabriel, 13/10/2026):
//   1. a pessoa solicita e o encarregado aprova (fluxo original);
//   2. o líder do setor já programa as datas, porque conversou com a pessoa;
//   3. o Márcio (Trabalhista) programa direto, mantendo o controle.
//
// Antes disso, o Márcio cadastra para cada pessoa o período aquisitivo e a
// data limite para iniciar o gozo. Sem programação perto do limite, o sinal
// fica vermelho. Os dados podem vir do Questor (GET /rh/ferias-a-vencer).

/** Quem mantém o controle de períodos aquisitivos e programa para qualquer setor. */
// Gabriel (TI) incluído para acompanhar a implantação e importar do Questor.
export const CONTROLE_FERIAS = ["marcio@phdcontabil.com.br", "gabriel.santos@phdcontabil.com.br"];

/** Sócios: não entram no controle de férias (pedido do Gabriel, 15/10/2026). */
export const SOCIOS_SEM_FERIAS = {
  emails: ["edcarlos@phdcontabil.com.br", "eduardo@phdcontabil.com.br", "junior@phdcontabil.com.br"],
  nomesQuestor: ["ED CARLOS CASTRO SOUSA", "EDUARDO GELOTTI BUENO", "MANOEL GARCIA DE SOUSA JUNIOR"],
};

/** Empresas do grupo no Questor (raiz do CNPJ): PHD Contábil, PHD Digital e PHD Negócios. */
export const EMPRESAS_PHD = [
  { raiz: "11274011", nome: "PHD Contábil" },
  { raiz: "11525190", nome: "PHD Digital" },
  { raiz: "09001701", nome: "PHD Negócios" },
];

export function ehControleFerias(email: string | null | undefined): boolean {
  const e = email?.toLowerCase();
  return !!e && CONTROLE_FERIAS.includes(e);
}

export type Sinal = "ok" | "aguardando" | "prazo" | "atencao" | "critico" | "vencido" | "sem-cadastro";

export interface AquisitivoBase {
  id?: number;
  inicio_aquisitivo: string;
  fim_aquisitivo: string;
  limite_gozo: string;
}

export interface ProgramacaoBase {
  status: string;
  aquisitivo_id?: number | null;
  periodos: { inicio: string; fim: string }[];
}

function addDias(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function addMeses(iso: string, n: number): string {
  const [a, m, dia] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/** Fim do aquisitivo = início + 1 ano − 1 dia. */
export function fimAquisitivoSugerido(inicio: string): string {
  return addDias(addMeses(inicio, 12), -1);
}

/**
 * Limite para iniciar o gozo sem dobra, na mesma regra do Questor:
 * fim do período concessivo (fim aquisitivo + 12 meses) − 30 dias.
 * Ex.: aquisitivo até 09/01/2026 → limite 10/12/2026.
 */
export function limiteSugerido(fimAquisitivo: string): string {
  return addDias(addMeses(fimAquisitivo, 12), -30);
}

export function diasAte(iso: string, hoje: string): number {
  const a = Date.parse(hoje + "T00:00:00Z");
  const b = Date.parse(iso + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

/** A programação cobre o aquisitivo: vinculada a ele, ou com início entre o fim do aquisitivo e o limite. */
export function cobre(aq: AquisitivoBase, p: ProgramacaoBase): boolean {
  if (p.status !== "aprovada" && p.status !== "pendente") return false;
  if (aq.id != null && p.aquisitivo_id === aq.id) return true;
  return p.periodos.some((x) => x.inicio > aq.fim_aquisitivo && x.inicio <= aq.limite_gozo);
}

/**
 * Sinal do período: verde se já programado; amarelo se há pedido aguardando;
 * sem programação, vermelho a 60 dias do limite (ou vencido) e laranja a 120.
 */
export function sinalDoAquisitivo(aq: AquisitivoBase, programacoes: ProgramacaoBase[], hoje: string): Sinal {
  const cobertas = programacoes.filter((p) => cobre(aq, p));
  if (cobertas.some((p) => p.status === "aprovada")) return "ok";
  if (cobertas.some((p) => p.status === "pendente")) return "aguardando";
  const d = diasAte(aq.limite_gozo, hoje);
  if (d < 0) return "vencido";
  if (d <= 60) return "critico";
  if (d <= 120) return "atencao";
  return "prazo";
}

export const ROTULO_SINAL: Record<Sinal, string> = {
  ok: "Programada",
  aguardando: "Aguardando aprovação",
  prazo: "No prazo",
  atencao: "Programar em breve",
  critico: "Programar já",
  vencido: "Limite vencido",
  "sem-cadastro": "Sem período aquisitivo",
};

function normalizar(s: string): string[] {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(sr|sra|dr|dra)\.?\s/g, " ").replace(/[^a-z ]/g, " ")
    .split(/\s+/).filter((t) => t.length > 1);
}

/** O nome curto do cadastro ("Julia Rodrigues") está contido no nome completo do Questor. */
export function nomeCasa(curto: string, completo: string): boolean {
  const a = normalizar(curto);
  const b = new Set(normalizar(completo));
  return a.length > 0 && a.every((t) => b.has(t));
}

/**
 * Casa os nomes curtos do cadastro com os nomes completos do Questor.
 *
 * Em rodadas: primeiro os pares sem ambiguidade (só um nome do Questor serve
 * para o cadastro E só um cadastro serve para aquele nome); tira esses e repete.
 * Assim "Sra. Conceição" fica com MARIA CONCEICAO e, na rodada seguinte,
 * "Maria" fica com a outra Maria. O que continuar ambíguo não é vinculado.
 */
export function casarNomes(cadastro: { id: number; nome: string }[], questor: string[]): Map<number, string> {
  const res = new Map<number, string>();
  let pessoas = [...cadastro];
  let nomes = [...new Set(questor)];
  for (let rodada = 0; rodada < 5; rodada++) {
    const novos: [number, string][] = [];
    for (const p of pessoas) {
      const cands = nomes.filter((n) => nomeCasa(p.nome, n));
      if (cands.length !== 1) continue;
      // Bloqueia só se outro cadastro também tiver ESTE como único candidato.
      const rivais = pessoas.filter((o) => o.id !== p.id
        && nomeCasa(o.nome, cands[0]) && nomes.filter((n) => nomeCasa(o.nome, n)).length === 1);
      if (rivais.length === 0) novos.push([p.id, cands[0]]);
    }
    if (novos.length === 0) break;
    for (const [id, n] of novos) res.set(id, n);
    pessoas = pessoas.filter((p) => !res.has(p.id));
    nomes = nomes.filter((n) => ![...res.values()].includes(n));
  }
  return res;
}

/**
 * Prazo mínimo para pedir férias: até o dia 15 do mês anterior ao início.
 * Ex.: férias em outubro → pedir até 15/09.
 */
export function prazoParaSolicitar(inicio: string): string {
  const [a, m] = inicio.split("-").map(Number);
  const anterior = new Date(Date.UTC(a, m - 2, 15));
  return anterior.toISOString().slice(0, 10);
}

export function dentroDoPrazo(inicio: string, hoje: string): boolean {
  return hoje <= prazoParaSolicitar(inicio);
}
