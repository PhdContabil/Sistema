// Falhas PASSAGEIRAS do SharePoint/rede/banco — lógica PURA (sem imports), pra
// poder ser testada sem nada externo.
//
// Uma falha passageira (o SharePoint pediu pra esperar — 429, ou ficou fora do ar
// por instantes — 502/503/504, a rede caiu no meio da chamada) NÃO diz nada sobre
// a empresa: tentar de novo daqui a pouco costuma resolver. Tratá-la como
// resultado final é o que gerava "ERRO" falso numa empresa boa e, pior, derrubava
// a varredura inteira no meio.

/** Códigos HTTP que significam "agora não deu, tente de novo". */
export const STATUS_HTTP_TRANSITORIOS: ReadonlySet<number> = new Set([429, 502, 503, 504]);

/** Quantas tentativas seguidas uma EMPRESA pode ter (1 por passo da varredura)
 * antes de ser dada como erro e a varredura seguir pra próxima. */
export const MAX_TENTATIVAS_EMPRESA = 5;

/** Quantas falhas seguidas do PASSO inteiro (mapeamento, credencial, banco…)
 * a varredura aguenta antes de parar com erro. */
export const MAX_FALHAS_SEGUIDAS_VARREDURA = 10;

/** Depois de uma falha passageira, espera-se isto antes de tentar de novo (os
 * passos que chegarem antes — o navegador chama sem parar — não fazem nada). */
export const ESPERA_ENTRE_TENTATIVAS_MS = 20_000;

/** Motivo (coluna `motivo` da empresa) enquanto ela espera a próxima tentativa. */
export const MOTIVO_SHAREPOINT_INSTAVEL = "SHAREPOINT INSTÁVEL (tentando de novo)";

function statusDe(e: unknown): number {
  if (typeof e === "object" && e !== null && "status" in e) return Number((e as { status: unknown }).status);
  return NaN;
}

/** Erro HTTP que é claramente passageiro (429/502/503/504). É o único critério
 * usado no nível do DOCUMENTO: um arquivo que dá erro sempre (corrompido, 500…)
 * continua sendo registrado como "erro ao ler" e a busca segue pro próximo. */
export function ehStatusTransitorio(e: unknown): boolean {
  return STATUS_HTTP_TRANSITORIOS.has(statusDe(e));
}

/** Falha passageira em sentido amplo — status HTTP passageiro, queda de rede,
 * "Bad Gateway" do banco ou erro sem mensagem nenhuma (o que sobra quando a
 * conexão cai no meio da chamada). Credencial inválida, pasta inexistente e bugs
 * NÃO entram aqui: esses param de imediato, como sempre. */
export function ehErroTransitorio(e: unknown): boolean {
  if (ehStatusTransitorio(e)) return true;
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (!msg.trim()) return true;
  return /fetch failed|network|bad gateway|gateway time-?out|service unavailable|temporarily unavailable|timed? ?out|econnreset|etimedout|econnrefused|enotfound|socket hang up|too many requests|muitas consultas/i.test(
    msg
  );
}

/** `Retry-After` do SharePoint (segundos ou data HTTP) em milissegundos, ou null. */
export function esperaDoRetryAfter(valor: string | null | undefined, agora: number = Date.now()): number | null {
  if (!valor) return null;
  const segundos = Number(valor);
  if (Number.isFinite(segundos)) return Math.max(0, segundos) * 1000;
  const data = Date.parse(valor);
  return Number.isFinite(data) ? Math.max(0, data - agora) : null;
}

/** Em "SHAREPOINT INSTÁVEL (tentativa 3 de 5): …", devolve 3 (0 se não for isso). */
export function tentativasDaEmpresa(motivo: string | null | undefined, status: string | null | undefined): number {
  if (motivo !== MOTIVO_SHAREPOINT_INSTAVEL) return 0;
  const m = /tentativa (\d+) de \d+/.exec(status ?? "");
  return m ? Number(m[1]) : 0;
}

/** Marca de falha seguida da varredura, guardada no campo `erro` da simulação
 * (que só aparece pro usuário quando o status é "erro"):
 * "[2026-10-16T13:40:00.000Z] falha 3 de 10: mensagem". */
export function marcaDeFalha(n: number, quando: number, mensagem: string): string {
  return `[${new Date(quando).toISOString()}] falha ${n} de ${MAX_FALHAS_SEGUIDAS_VARREDURA}: ${mensagem}`;
}

export function lerMarcaDeFalha(erro: string | null | undefined): { n: number; quando: number } | null {
  const m = /^\[([^\]]+)\] falha (\d+) de \d+/.exec(erro ?? "");
  if (!m) return null;
  const quando = Date.parse(m[1]);
  return Number.isFinite(quando) ? { n: Number(m[2]), quando } : null;
}
