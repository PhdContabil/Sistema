// Camada Questor do Sistema MEI (migrado do "MEI System" local).
// SOMENTE SERVIDOR: usa a X-API-Key de leitura. Mantém as regras do server.js
// antigo: mínimo de 120 ms entre chamadas, até 4 tentativas em 503/429/falha
// de rede, e cache da lista MEI por 10 minutos (por instância do servidor).

const BASE = (process.env.QUESTOR_API_URL ?? "https://phdfibra.dyndns.org").replace(/\/$/, "");
const KEY = process.env.QUESTOR_API_KEY ?? "";

let ultimo = 0;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export async function q(
  caminho: string,
  params: Record<string, string | number | boolean | undefined | null> = {},
): Promise<{ status: number; json: Json }> {
  if (!KEY) return { status: 500, json: { erro: "QUESTOR_API_KEY não configurada no servidor." } };
  const url = new URL(BASE + caminho);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  let status = 0;
  let txt = "";
  for (let t = 0; t < 4; t++) {
    const espera = Math.max(0, ultimo + 120 - Date.now());
    ultimo = Date.now() + espera;
    if (espera) await dormir(espera);
    try {
      const r = await fetch(url, { headers: { "X-API-Key": KEY, Accept: "application/json" }, cache: "no-store" });
      status = r.status;
      txt = await r.text();
      if (status !== 503 && status !== 429) break;
    } catch (e) {
      status = 0;
      txt = e instanceof Error ? e.message : String(e);
    }
    await dormir(500 * (t + 1) * (t + 1));
  }
  if (!status) return { status: 502, json: { erro: txt } };
  try { return { status, json: JSON.parse(txt) }; } catch { return { status, json: { erro: txt.slice(0, 300) } }; }
}

export const mascararDoc = (d: unknown) => {
  const s = String(d ?? "").replace(/\D/g, "");
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return s;
};

export interface MeiServico { descricao?: string; valor?: number; competfinalvalid?: string | null; periodicidade?: string }

export interface MeiItem {
  cod: number; codigocliente: number | null; razao: string; cnpj: string;
  salao: string; salaoCnpj: string; salaoCod: number | null;
  bloqueado: boolean; segmento: number | null;
  inicio: string | null; fim: string | null; ativo: boolean; mensal: number; clienteDesde: string | null; mensalNF: boolean;
  cidade: string; uf: string; email: string; cel: string; cpf: string; ie: string; im: string; cnae: string;
  endereco: string; compl: string; bairro: string; cep: string;
  mae: string; rg: string; nasc: string; titulo: string; whats: string; socio: string; apelido: string;
  servicos: MeiServico[];
  ativMunic: string;
}

let cache: { t: number; v: MeiItem[] } | null = null;
const TTL = 10 * 60 * 1000;
export const AVULSO_SALAO = 53278;
const ATIVO_ATE = "2100-12-31";

/**
 * Carteira MEI com as MESMAS regras do Access (validadas em 08/10/2026 contra o MeiSistema.accdb):
 * - quem é MEI: /mei/empresas (cfgempresagem.tipoenquad = 4 e código < 4000) = consultaMEI;
 * - ativo: dataencerativ = 31/12/2100 (o Access não usa a data de hoje);
 * - salão: Val(apelidoestab) = codigopessoafin; 53278 = avulso;
 * - bloqueado: último segmento = 2;
 * - mensalidade: servicofixo codigoescrit 1, serviço 72/102, sem competfinalvalid, MEI = 4 primeiros
 *   caracteres do compldescr (sem "plano B" pelos serviços do próprio MEI — o Access não tem).
 * Os dados cadastrais (endereço, sócio, IE/IM, CNAE) vêm de /empresas/cadastro.
 */
export async function listaMEI(forcar = false): Promise<MeiItem[]> {
  if (!forcar && cache && Date.now() - cache.t < TTL) return cache.v;
  const [me, r] = await Promise.all([
    q("/mei/empresas", { limit: 5000 }),
    q("/empresas/cadastro", { apenas_ativas: "false", detalhado: "true" }),
  ]);
  if (me.status !== 200) throw new Error(`Questor /mei/empresas ${me.status}: ${JSON.stringify(me.json).slice(0, 200)}`);
  const cad = new Map<number, Json>();
  if (r.status === 200) for (const e of r.json.dados ?? []) if (e.codigoestab === 1 || e.matriz) cad.set(e.codigoempresa, e);

  const mensal = new Map<number, { valor: number; desde: string | null; nf: boolean }>();
  try {
    const sf = await q("/financeiro/servicos-fixos");
    if (sf.status === 200) for (const x of sf.json.dados ?? []) {
      if (!x.codigoempresa_mei || x.competfinalvalid || x.codigoescrit !== 1 || ![72, 102].includes(x.codigoservicoescrit)) continue;
      const a = mensal.get(x.codigoempresa_mei) ?? { valor: 0, desde: null, nf: false };
      a.valor += +x.valor || 0;
      if (!a.desde || (x.competinicialvalid && x.competinicialvalid < a.desde)) a.desde = x.competinicialvalid ?? a.desde;
      if (x.codigoservicoescrit === 102) a.nf = true;
      mensal.set(x.codigoempresa_mei, a);
    }
  } catch { /* segue sem mensalidade */ }

  const out: MeiItem[] = [];
  for (const m of me.json.dados ?? []) {
    const e = cad.get(m.codigoempresa) ?? {};
    const s = (e.socios ?? []).find((x: Json) => x.codigosocio === 1) ?? (e.socios ?? [])[0] ?? {};
    const salaoCod = m.salao_codigopessoafin ?? null;
    const mm = mensal.get(m.codigoempresa);
    out.push({
      cod: m.codigoempresa, codigocliente: m.codigocliente ?? e.codigocliente ?? null, razao: m.nome || e.nomeestab || "",
      cnpj: mascararDoc(m.cnpj ?? e.inscrfederal),
      salao: salaoCod === AVULSO_SALAO || !salaoCod ? "AVULSO" : (m.salao_nome || e.salao_nome || ""),
      salaoCnpj: e.salao_cnpj || "", salaoCod,
      bloqueado: !!m.bloqueado, segmento: m.codigosegmento ?? null,
      inicio: m.datainicioativ ?? null, fim: m.dataencerativ ?? null,
      ativo: String(m.dataencerativ ?? "").slice(0, 10) === ATIVO_ATE,
      mensal: Math.round((mm?.valor ?? 0) * 100) / 100, clienteDesde: mm?.desde ?? null, mensalNF: !!mm?.nf,
      cidade: m.municipio || e.nomemunic || "", uf: m.uf || e.siglaestado || "", email: e.email || s.email || "",
      cel: e.telefone || "", cpf: mascararDoc(s.inscrfederal), ie: e.inscrestad || "", im: e.inscrmunic || "",
      cnae: [e.codigoativfederal, e.ativfederal].filter(Boolean).join(" - "),
      endereco: [e.tipologradouro, e.enderecoestab].filter(Boolean).join(" ") + (e.numenderestab ? ", " + e.numenderestab : ""),
      compl: e.complenderestab || "", bairro: e.bairroenderestab || "", cep: e.cependerestab || "",
      mae: s.nomemae || "", rg: s.numerorg || "", nasc: s.datanasc || "", titulo: s.tituloeleitornumero || "",
      whats: s.numerocelular ? `(${s.dddcelular || ""}) ${s.numerocelular}` : "",
      socio: s.nomesocio || "", apelido: String(m.apelidoestab ?? ""), servicos: e.servicos ?? [],
      ativMunic: [e.codigoativmunic, e.descrativmunestab].filter(Boolean).join(" - "),
    });
  }
  out.sort((a, b) => a.cod - b.cod);
  cache = { t: Date.now(), v: out };
  return out;
}

/** Notas de saída (lctofis) de uma competência para até 60 empresas. */
export async function notasMEI(competencia: string, cods: number[]) {
  const lista = cods.filter(Boolean).slice(0, 60);
  const dados: Json[] = [];
  let truncado = false;
  const r1 = await q("/fiscal/lancamentos", { competencia, cods: lista.join(","), tipo: "saida" });
  if (r1.status === 200) {
    dados.push(...(r1.json.dados ?? []));
    truncado = !!r1.json.truncado;
  } else {
    for (let i = 0; i < lista.length; i += 6) {
      const rs = await Promise.all(lista.slice(i, i + 6).map((c) => q("/fiscal/lancamentos", { competencia, codigoempresa: c, tipo: "saida" })));
      for (const r of rs) if (r.status === 200) { dados.push(...(r.json.dados ?? [])); truncado = truncado || !!r.json.truncado; }
    }
  }
  return { competencia, total: dados.length, truncado, dados };
}
