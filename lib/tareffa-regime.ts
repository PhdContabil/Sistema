// Regime tributário da empresa, lido do Tareffa (SERVIDOR).
//
// Fonte: Empresas > Características > 01.Regime Tributário. A tela de empresas
// do Tareffa busca com POST /services/empresas/f (filtro `codigoERP`) e cada
// registro traz `regimeTributario: { id, descricao }`. O Código ERP do Tareffa
// é o CODIGOEMPRESA do Questor + "-" + estabelecimento (ex.: 1415-1).
//
// Usa o mesmo OAuth do restante do Núcleo (lib/tareffa-documentos.ts).

import { tokenTareffa, invalidarTokenTareffa, TareffaError } from "./tareffa-documentos";
import { regimeDeDescricao, type Regime } from "./informe-rendimentos";

const API = "https://prd-api-oauth-tareffa.ottimizza.dev/services";
const TIMEOUT_MS = 15_000;
const TTL_MS = 2 * 60 * 1000;

export interface RegimeEmpresa {
  codigoempresa: number;
  tareffaId: number | null;
  codigoErp: string | null;
  razaoSocial: string | null;
  /** Texto do Tareffa, como está cadastrado ("Lucro Real"…). null = sem regime marcado. */
  regimeDescricao: string | null;
  /** null quando o regime não é Presumido nem Real (Simples, MEI…) ou não está marcado. */
  regime: Regime | null;
}

interface RegistroTareffa {
  id?: number;
  razaoSocial?: string;
  codigoErp?: string;
  regimeTributario?: { id?: number; descricao?: string } | null;
}

const cache = new Map<number, { em: number; v: RegimeEmpresa | null }>();

async function buscarPorErp(codigoErp: string, tentou401 = false): Promise<RegistroTareffa | null> {
  const r = await fetch(`${API}/empresas/f?page_size=10&page_index=0`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await tokenTareffa()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    // Corpo no formato que a própria tela do Tareffa envia; só o codigoERP é usado.
    body: JSON.stringify({
      codigoERP: codigoErp, codigosERP: [], razaoSocial: "", cnpj: "", matriz: null, situacao: null,
      isAtivo: true, classificacao: [], regimeTributario: [], cnaePrincipal: [],
      departamento: { id: null, descricao: "" }, responsavel: { id: null, nome: "", email: "" },
      caracteristicas: [],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (r.status === 401 && !tentou401) {
    invalidarTokenTareffa();
    return buscarPorErp(codigoErp, true);
  }
  if (!r.ok) throw new TareffaError(`Consulta de empresa no Tareffa: HTTP ${r.status}`);
  const j = (await r.json().catch(() => null)) as { records?: RegistroTareffa[] } | null;
  const achados = j?.records ?? [];
  // O filtro do Tareffa é por semelhança ("1415-1" também casaria "11415-1"):
  // só vale o registro cujo código é exatamente o pedido.
  return achados.find((x) => (x.codigoErp ?? "").trim() === codigoErp) ?? null;
}

/**
 * Regime da empresa pelo código do Questor. Tenta "<codigo>-1" e, se não achar,
 * "<codigo>" (algumas empresas antigas não têm o sufixo). Devolve null se o
 * Tareffa não conhece a empresa. Lança TareffaError se o Tareffa falhar.
 */
export async function obterRegimeEmpresa(codigoempresa: number): Promise<RegimeEmpresa | null> {
  const hit = cache.get(codigoempresa);
  if (hit && Date.now() - hit.em < TTL_MS) return hit.v;

  let reg = await buscarPorErp(`${codigoempresa}-1`);
  if (!reg) reg = await buscarPorErp(String(codigoempresa));

  const v: RegimeEmpresa | null = reg
    ? {
        codigoempresa,
        tareffaId: reg.id ?? null,
        codigoErp: reg.codigoErp ?? null,
        razaoSocial: reg.razaoSocial ?? null,
        regimeDescricao: reg.regimeTributario?.descricao ?? null,
        regime: regimeDeDescricao(reg.regimeTributario?.descricao),
      }
    : null;
  cache.set(codigoempresa, { em: Date.now(), v });
  return v;
}
