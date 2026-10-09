// Ponte do Sistema MEI com a API Questor (somente servidor).
// - Leitura: X-API-Key.
// - Gravação no Questor (/cadastro, /empresas/{cod}/encerrar|reativar): X-Write-Key.
// - Gravação nas tabelas do MEI (/mei/*): X-Mei-Key (perfil operador) — env MEI_API_KEY.
// - Credenciais (senhas): X-Mei-Key do perfil credencial — env MEI_CRED_KEY.
// TRAVA: enquanto MEI_GRAVACAO_LIBERADA !== "sim", TODA gravação vai com dry_run=true
// (a API executa e desfaz). Assim dá para validar tudo sem gravar nada.

const BASE = (process.env.QUESTOR_API_URL ?? "https://phdfibra.dyndns.org").replace(/\/$/, "");
const KEY = process.env.QUESTOR_API_KEY ?? "";
const WRITE_KEY = process.env.QUESTOR_WRITE_KEY ?? "";
const MEI_KEY = process.env.MEI_API_KEY ?? "";
const CRED_KEY = process.env.MEI_CRED_KEY ?? "";

/**
 * Trava por recurso. MEI_GRAVACAO_LIBERADA = "sim" libera tudo; ou uma lista separada por vírgula,
 * ex.: "cadastro,os". Recursos: cadastro (cliente mensal/avulso), os, nota, tarefas, senhas,
 * ficha (alterar dados/encerrar/reativar), contratos.
 */
export function gravacaoLiberada(recurso?: string): boolean {
  const v = (process.env.MEI_GRAVACAO_LIBERADA ?? "").toLowerCase().split(",").map((s) => s.trim());
  if (v.includes("sim")) return true;
  return !!recurso && v.includes(recurso);
}

/** Qual recurso da trava uma rota da API usa. */
export function recursoDaRota(caminho: string): string {
  if (/^\/cadastro\/(empresa|pessoa-financeiro)$/.test(caminho)) return "cadastro";
  if (/^\/mei\/os/.test(caminho) || /^\/cadastro\/servico-(fixo|variavel)$/.test(caminho)) return "os";
  if (/^\/fiscal\/nota-servico$/.test(caminho)) return "nota";
  if (/^\/mei\/credenciais/.test(caminho)) return "senhas";
  if (/^\/cadastro\/(estabelecimento|socio)\//.test(caminho) || /^\/empresas\/\d+\//.test(caminho)) return "ficha";
  return "tarefas";
}

// Rotas permitidas (lista branca). Método + regex do caminho.
const LEITURA: RegExp[] = [
  /^\/mei\/(empresas|tarefas|servicos|responsaveis|observacoes|config)$/,
  /^\/mei\/tarefas\/\d+$/,
  /^\/mei\/observacoes\/\d+$/,
  /^\/mei\/credenciais$/,
  /^\/fiscal\/lancamentos$/,
  /^\/financeiro\/(clientes|servicos-fixos)$/,
  /^\/lookups(\/[a-z-]+)?$/,
  /^\/empresas\/(cadastro|contatos|existe|historico|cnae|servicos-detalhe)$/,
  /^\/cadastro\/(proximo-codigo|faixas)$/,
  /^\/mei\/os(\/\d+)?$/,
];
const GRAVACAO: [string, RegExp][] = [
  ["POST", /^\/mei\/tarefas$/],
  ["POST", /^\/mei\/tarefas\/(gerar|lote)$/],
  ["PATCH", /^\/mei\/tarefas\/\d+$/],
  ["PATCH", /^\/mei\/tarefas\/\d+\/validacao$/],
  ["POST", /^\/mei\/(servicos|responsaveis)$/],
  ["PATCH", /^\/mei\/(servicos|responsaveis)\/\d+$/],
  ["PUT", /^\/mei\/observacoes\/\d+$/],
  ["POST", /^\/mei\/credenciais$/],
  ["PATCH", /^\/mei\/credenciais\/\d+$/],
  ["DELETE", /^\/mei\/credenciais\/\d+$/],
  ["POST", /^\/empresas\/\d+\/(encerrar|reativar)$/],
  ["POST", /^\/cadastro\/(servico-fixo|servico-variavel|empresa|pessoa-financeiro)$/],
  ["PATCH", /^\/cadastro\/(estabelecimento|socio)\/\d+\/\d+$/],
  ["POST", /^\/fiscal\/nota-servico$/],
  ["POST", /^\/mei\/os$/],
  ["PATCH", /^\/mei\/os\/\d+$/],
];

export function rotaPermitida(metodo: string, caminho: string): boolean {
  if (metodo === "GET") return LEITURA.some((r) => r.test(caminho)) || /^\/mei\/credenciais\/\d+\/segredo$/.test(caminho);
  return GRAVACAO.some(([m, r]) => m === metodo && r.test(caminho));
}

function cabecalhos(metodo: string, caminho: string, usuario: string | null): Record<string, string> {
  const h: Record<string, string> = { "X-API-Key": KEY, Accept: "application/json" };
  if (usuario) h["X-Usuario"] = usuario;
  const ehCred = caminho.startsWith("/mei/credenciais");
  if (ehCred) {
    if (CRED_KEY) h["X-Mei-Key"] = CRED_KEY;
  } else if (caminho.startsWith("/mei/") && metodo !== "GET") {
    if (MEI_KEY) h["X-Mei-Key"] = MEI_KEY;
  } else if (metodo !== "GET") {
    if (WRITE_KEY) h["X-Write-Key"] = WRITE_KEY;
  }
  return h;
}

let ultimo = 0;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Resposta { status: number; json: unknown; dryRunForcado?: boolean }

/** Chamada à API com ritmo mínimo de 120 ms e até 4 tentativas em 503/429 (só para leitura). */
export async function chamar(
  metodo: string, caminho: string,
  opts: { query?: Record<string, unknown>; corpo?: unknown; usuario?: string | null; idempotencia?: string } = {},
): Promise<Resposta> {
  if (!KEY) return { status: 500, json: { erro: "QUESTOR_API_KEY não configurada." } };
  const url = new URL(BASE + caminho);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  let dryRunForcado = false;
  if (metodo !== "GET" && !gravacaoLiberada(recursoDaRota(caminho))) {
    url.searchParams.set("dry_run", "true");
    dryRunForcado = true;
  }
  const h = cabecalhos(metodo, caminho, opts.usuario ?? null);
  if (opts.idempotencia) h["Idempotency-Key"] = opts.idempotencia;
  if (opts.corpo !== undefined) h["Content-Type"] = "application/json";
  const tentativas = metodo === "GET" ? 4 : 1;
  let status = 0;
  let txt = "";
  for (let t = 0; t < tentativas; t++) {
    const espera = Math.max(0, ultimo + 120 - Date.now());
    ultimo = Date.now() + espera;
    if (espera) await dormir(espera);
    try {
      const r = await fetch(url, { method: metodo, headers: h, body: opts.corpo !== undefined ? JSON.stringify(opts.corpo) : undefined, cache: "no-store" });
      status = r.status;
      txt = await r.text();
      if (status !== 503 && status !== 429) break;
    } catch (e) {
      status = 0;
      txt = e instanceof Error ? e.message : String(e);
    }
    if (t < tentativas - 1) await dormir(500 * (t + 1) * (t + 1));
  }
  if (!status) return { status: 502, json: { erro: txt }, dryRunForcado };
  let json: unknown;
  try { json = JSON.parse(txt); } catch { json = { erro: txt.slice(0, 300) }; }
  return { status, json, dryRunForcado };
}

export const chavesConfiguradas = () => ({
  leitura: !!KEY, questor: !!WRITE_KEY, mei: !!MEI_KEY, credenciais: !!CRED_KEY, gravacao: gravacaoLiberada(),
  liberados: ["cadastro", "os", "nota", "tarefas", "senhas", "ficha", "contratos"].filter((r) => gravacaoLiberada(r)),
});
