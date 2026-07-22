// Cliente da API do Tareffa Societário
// Documentação: https://societario.tareffa.com.br/api/

export interface SocietalActivity {
  id: number;
  name: string;
  responsible: string | null;
  situation: string | null;
  situation_in: string | null;
  order: string;
  closed_in: string | null;
  deadline_in: string | null;
  updated_in: string;
}

export interface SocietalIndicator {
  id: number;
  name: string;            // Nome da empresa
  inscription: string;     // CNPJ
  bearer: string | null;   // Responsável
  process: string;         // Tipo do processo (ex: Alteração contratual)
  status: string;          // ex: ANDAMENTO / CONCLUÍDO
  started_in: string;
  value: number | null;
  proposal: string | null;
  closed_in: string | null;
  updated_in: string;
  activities: SocietalActivity[];
}

export interface SocietalSituationResponse {
  total: number;
  indicators: SocietalIndicator[];
}

export type SocietalRangeMode = "started" | "updated";

export interface SocietalSituationParams {
  /** "started" busca processos iniciados no período. "updated" busca atualizados no período. */
  mode: SocietalRangeMode;
  /** Data inicial YYYY-MM-DD */
  from: string;
  /** Data final YYYY-MM-DD (máximo 31 dias depois de `from`) */
  to: string;
}

const API_BASE =
  process.env.TAREFFA_API_BASE ?? "https://societario.tareffa.com.br";

function getToken(): string {
  const token = process.env.TAREFFA_API_TOKEN;
  if (!token) {
    throw new Error(
      "TAREFFA_API_TOKEN não configurado. Defina em .env.local"
    );
  }
  return token;
}

// Cache do dispatcher pra não recriar a cada call.
let _insecureDispatcher: unknown = null;

/**
 * Retorna um undici Agent que ignora validação do certificado HTTPS.
 * Usado SÓ para o host do Tareffa, que tem uma cadeia de certs incompleta.
 * Import dinâmico (sem tipo) pra não exigir @types/undici e funcionar
 * mesmo se a dep não estiver instalada em ambiente local.
 */
async function getInsecureDispatcher(): Promise<unknown> {
  if (_insecureDispatcher) return _insecureDispatcher;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const undici = (await import(/* webpackIgnore: true */ "undici" as string)) as any;
    _insecureDispatcher = new undici.Agent({
      connect: { rejectUnauthorized: false },
    });
    return _insecureDispatcher;
  } catch {
    // Se undici não estiver disponível por algum motivo, devolve undefined.
    return undefined;
  }
}

/**
 * Busca a situação societária no período informado.
 * Retorna processos com a empresa associada e a lista de atividades.
 */
export async function getSocietalSituation(
  params: SocietalSituationParams
): Promise<SocietalSituationResponse> {
  const qs = new URLSearchParams();
  if (params.mode === "started") {
    qs.set("started_ini", params.from);
    qs.set("started_end", params.to);
  } else {
    qs.set("updated_ini", params.from);
    qs.set("updated_end", params.to);
  }

  const url = `${API_BASE}/api/societal/situation/?${qs.toString()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
        Accept: "application/json",
      },
      cache: "no-store",
      // ⚠️ WORKAROUND TEMPORÁRIO — o servidor do Tareffa envia uma cadeia de
      // certificados HTTPS incompleta (sem o intermediário). Browsers baixam
      // o intermediário automaticamente, mas o Node.js não — por isso quebra
      // com CERT_HAS_EXPIRED / UNABLE_TO_VERIFY_LEAF_SIGNATURE.
      // Aceita a conexão TLS sem validação só pra ESTE host.
      // Remover quando a Tareffa corrigir a cadeia no servidor deles.
      // @ts-expect-error dispatcher é uma extensão do undici não tipada no Response global.
      dispatcher: await getInsecureDispatcher(),
    });
  } catch (e) {
    // "fetch failed" — DNS, TLS, timeout, host inacessível.
    const err = e as Error & { cause?: { code?: string; message?: string } };
    const code = err.cause?.code || "";
    const causeMsg = err.cause?.message || err.message || "fetch failed";
    throw new Error(
      `Tareffa indisponível (${code || "rede"}): ${causeMsg}. ` +
        `Confira se TAREFFA_API_BASE e TAREFFA_API_TOKEN estão setados nas env vars da Vercel.`
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Tareffa API ${res.status}: token inválido ou expirado. Verifique TAREFFA_API_TOKEN.`
      );
    }
    throw new Error(
      `Tareffa API ${res.status}: ${body.slice(0, 300)}`
    );
  }

  return (await res.json()) as SocietalSituationResponse;
}

/**
 * Extrai a lista única de empresas a partir da resposta da API.
 * Como a API não tem um endpoint dedicado de empresas, deduplicamos pelo CNPJ.
 */
export function extractEmpresas(
  resp: SocietalSituationResponse
): Array<{ inscription: string; name: string; processCount: number }> {
  const map = new Map<
    string,
    { inscription: string; name: string; processCount: number }
  >();
  for (const ind of resp.indicators) {
    const key = ind.inscription || ind.name;
    const cur = map.get(key);
    if (cur) {
      cur.processCount += 1;
    } else {
      map.set(key, {
        inscription: ind.inscription,
        name: ind.name,
        processCount: 1,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR")
  );
}

/** Formata data ISO (YYYY-MM-DD ou ISO completo) como dd/mm/aaaa */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = value.length > 10 ? value.slice(0, 10) : value;
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return value;
  return `${day}/${m}/${y}`;
}

/** Retorna a string YYYY-MM-DD para a data atual (timezone do server) */
export function today(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

/** Retorna a string YYYY-MM-DD subtraindo N dias da data atual */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
