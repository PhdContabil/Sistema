// Cliente server-side da API Questor. NUNCA importe isto em um componente client:
// a chave X-API-Key só pode existir no servidor (LGPD / dados PII).
import type { ConciliacaoResponse } from "./conciliacao";
import type { AnaliseLimiteResponse, DctfwebResponse } from "./fiscal";

const BASE = process.env.QUESTOR_API_URL ?? "https://phdfibra.dyndns.org";
const KEY = process.env.QUESTOR_API_KEY;

export class QuestorError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function get<T>(path: string): Promise<T> {
  if (!KEY) {
    throw new QuestorError(
      "QUESTOR_API_KEY não configurada no servidor. Defina a variável de ambiente.",
      500
    );
  }
  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-API-Key": KEY },
    // dados lidos em tempo real; sem cache do Next
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new QuestorError(`Erro ${res.status} na API Questor: ${detail}`, res.status);
  }
  return (await res.json()) as T;
}

export function getConciliacaoHonorarios(cnpj?: string): Promise<ConciliacaoResponse> {
  const qs = cnpj ? `?cnpj=${encodeURIComponent(cnpj)}` : "";
  return get<ConciliacaoResponse>(`/fiscal/conciliacao-honorarios${qs}`);
}

export function getAnaliseLimite(params: { ano?: number; cnpj?: string } = {}): Promise<AnaliseLimiteResponse> {
  const q = new URLSearchParams();
  if (params.ano) q.set("ano", String(params.ano));
  if (params.cnpj) q.set("cnpj", params.cnpj);
  const qs = q.toString() ? `?${q.toString()}` : "";
  return get<AnaliseLimiteResponse>(`/fiscal/analise-limite${qs}`);
}

export function getDctfwebObrigadas(params: { ano?: number; mes?: number; origem?: string; cnpj?: string } = {}): Promise<DctfwebResponse> {
  const q = new URLSearchParams();
  if (params.ano) q.set("ano", String(params.ano));
  if (params.mes) q.set("mes", String(params.mes));
  if (params.origem) q.set("origem", params.origem);
  if (params.cnpj) q.set("cnpj", params.cnpj);
  const qs = q.toString() ? `?${q.toString()}` : "";
  return get<DctfwebResponse>(`/fiscal/dctfweb-obrigadas${qs}`);
}

export function hasApiKey(): boolean {
  return Boolean(KEY);
}
