// Aviso no Teams a cada lançamento de Lucros Distribuídos.
//
// No Access, cada lançamento gravava uma linha na lista LogOperacoes do
// SharePoint e um fluxo do Power Automate postava o resumo no grupo do Teams
// (contábil e fiscal). No Núcleo o aviso sai direto do servidor, por um webhook
// de Fluxos de trabalho do Teams ("Postar em um canal ou chat quando uma
// solicitação de webhook for recebida").
//
// A URL do webhook é segredo: fica só na variável TEAMS_WEBHOOK_LUCROS (Vercel)
// e nunca vai para log, resposta da API ou navegador. Sem a variável, o aviso
// fica desligado e o lançamento segue normal.

export type EventoLucro = "novo" | "alterado" | "excluido";

export interface DadosAvisoLucro {
  evento: EventoLucro;
  /** AAAA-MM */
  competencia: string;
  codigoempresa: number;
  nomeEmpresa: string | null;
  nomeSocio: string | null;
  codigosocio: number;
  rendimento: number;
  imposto: number;
}

export type ResultadoAviso = "enviada" | "desligada" | "falhou";

const TITULO: Record<EventoLucro, string> = {
  novo: "Novo Lançamento:",
  alterado: "Lançamento Alterado:",
  excluido: "Lançamento Excluído:",
};

/** 42312.89 -> "42.312,89" (sem depender do ICU do Node). */
export function formatarValor(v: number): string {
  const n = Number.isFinite(v) ? v : 0;
  const [inteiro, dec] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

/** "2026-10" ou "2026-10-31" -> "10/2026" */
export function formatarCompetencia(c: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(c);
  return m ? `${m[2]}/${m[1]}` : c;
}

/** Linhas do aviso, na mesma ordem e com os mesmos rótulos do fluxo do Access. */
export function montarLinhasAvisoLucro(d: DadosAvisoLucro): string[] {
  const empresa = `${d.codigoempresa} - ${d.nomeEmpresa ?? "(nome não encontrado)"}`;
  const socio = d.nomeSocio ?? `Sócio ${d.codigosocio}`;
  return [
    TITULO[d.evento],
    `Competência: ${formatarCompetencia(d.competencia)}`,
    "Código Empresa:",
    empresa,
    "Sócio:",
    socio,
    "Lucro Distribuído:",
    formatarValor(d.rendimento),
    "Retenção:",
    formatarValor(d.imposto),
  ];
}

/** Cartão adaptativo aceito pelos webhooks de Fluxos de trabalho do Teams. */
export function montarCartaoTeams(linhas: string[]) {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: linhas.map((texto, i) => ({
            type: "TextBlock",
            text: texto,
            wrap: true,
            ...(i === 0 ? { weight: "Bolder" } : {}),
            spacing: "None",
          })),
        },
      },
    ],
  };
}

interface OpcoesAviso {
  url?: string | undefined;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Posta o aviso. Nunca lança: o lançamento no Questor já aconteceu e não pode
 * falhar por causa do Teams. O texto do erro não inclui a URL.
 */
export async function avisarLucro(d: DadosAvisoLucro, opcoes: OpcoesAviso = {}): Promise<ResultadoAviso> {
  const url = (opcoes.url ?? process.env.TEAMS_WEBHOOK_LUCROS ?? "").trim();
  if (!url) return "desligada";
  const f = opcoes.fetchFn ?? fetch;
  try {
    const r = await f(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(montarCartaoTeams(montarLinhasAvisoLucro(d))),
      signal: AbortSignal.timeout(opcoes.timeoutMs ?? 8000),
    });
    if (!r.ok) {
      console.error(`[teams] aviso recusado (HTTP ${r.status})`);
      return "falhou";
    }
    return "enviada";
  } catch (e) {
    console.error("[teams] falha ao enviar aviso:", e instanceof Error ? e.name : "erro");
    return "falhou";
  }
}
