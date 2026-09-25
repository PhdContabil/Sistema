// Cliente server-side da API Questor. NUNCA importe isto em um componente client:
// a chave X-API-Key só pode existir no servidor (LGPD / dados PII).
import type { ConciliacaoResponse } from "./conciliacao";
import type { AnaliseLimiteResponse, DctfwebResponse, IcmsDifalResponse } from "./fiscal";
import type { ConsolidacaoResponse, SocioItem } from "./contabil";
import type { PerfilResponse } from "./dissidio-tipos";
import type { FuncionariosAtivosResponse } from "./trabalhista";

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

export function getConciliacaoHonorarios(cnpj?: string, detalhado = false): Promise<ConciliacaoResponse> {
  const q = new URLSearchParams();
  if (cnpj) q.set("cnpj", cnpj);
  if (detalhado) q.set("detalhado", "true");
  const qs = q.toString() ? `?${q.toString()}` : "";
  return get<ConciliacaoResponse>(`/fiscal/conciliacao-honorarios${qs}`);
}

export interface EmpresaCadastro {
  codigoempresa: number;
  nome: string | null;
  cnpj: string | null;
  ativa: boolean;
}

/** Cadastro de empresas. `apenasAtivas=false` traz também as encerradas. */
export function getEmpresas(apenasAtivas = true): Promise<{ total: number; dados: EmpresaCadastro[] }> {
  const qs = apenasAtivas ? "" : "?apenas_ativas=false";
  return get<{ total: number; dados: EmpresaCadastro[] }>(`/empresas${qs}`);
}

/**
 * Cadastro detalhado de uma empresa (endereço, sócios etc.) por código Questor.
 * Usado no mail-merge de contratos, migrado do Paralegal System
 * (`/api/questor/empresas/cadastro?codigoempresa=...&detalhado=true`).
 * O formato exato dos campos varia conforme o Questor; por isso o tipo é solto.
 */
export interface EmpresaCadastroDetalhado {
  codigoempresa?: number | string;
  nomeempresa?: string | null;
  nome?: string | null;
  tipologradouro?: string | null;
  enderecoestab?: string | null;
  endereco?: string | null;
  numenderestab?: string | number | null;
  numero?: string | number | null;
  complenderestab?: string | null;
  complemento?: string | null;
  bairroenderestab?: string | null;
  bairro?: string | null;
  nomemunic?: string | null;
  cidade?: string | null;
  siglaestado?: string | null;
  uf?: string | null;
  cependerestab?: string | null;
  cep?: string | null;
  inscrfederal?: string | null;
  cnpj?: string | null;
  email?: string | null;
  socios?: SocioContratoQuestor[];
  quadrosocietario?: SocioContratoQuestor[];
  [chave: string]: unknown;
}

export interface SocioContratoQuestor {
  nomesocio?: string | null;
  nome?: string | null;
  inscrfederal?: string | null;
  cpf?: string | null;
  dddcelular?: string | null;
  dddfone?: string | null;
  numerocelular?: string | null;
  numerofone?: string | null;
  email?: string | null;
  codigosocio?: string | number | null;
  codigo?: string | number | null;
  [chave: string]: unknown;
}

export async function getEmpresaCadastroDetalhado(codigoEmpresa: string | number): Promise<EmpresaCadastroDetalhado> {
  const resp = await get<EmpresaCadastroDetalhado | EmpresaCadastroDetalhado[] | { dados: EmpresaCadastroDetalhado[] }>(
    `/empresas/cadastro?codigoempresa=${encodeURIComponent(String(codigoEmpresa))}&detalhado=true`
  );
  const linhas = Array.isArray(resp) ? resp : Array.isArray((resp as { dados?: unknown }).dados) ? (resp as { dados: EmpresaCadastroDetalhado[] }).dados : [resp as EmpresaCadastroDetalhado];
  const d = linhas[0];
  if (!d) throw new QuestorError("Empresa não encontrada no Questor.", 404);
  return d;
}

/** Consolidação Departamental: agregados por empresa e mês (valor + quantidade). */
export function getConsolidacaoDepartamental(
  params: { ano: number; cnpj?: string; codigoempresa?: number }
): Promise<ConsolidacaoResponse> {
  const q = new URLSearchParams();
  q.set("ano", String(params.ano));
  if (params.cnpj) q.set("cnpj", params.cnpj);
  if (params.codigoempresa) q.set("codigoempresa", String(params.codigoempresa));
  return get<ConsolidacaoResponse>(`/contabil/consolidacao-departamental?${q.toString()}`);
}

/** Quadro societário. Por padrão só os sócios atuais. */
export function getSocios(incluirDesligados = false): Promise<{ total: number; dados: SocioItem[] }> {
  const qs = incluirDesligados ? "?incluir_desligados=true" : "";
  return get<{ total: number; dados: SocioItem[] }>(`/rh/socios${qs}`);
}

/**
 * Perfil da carteira por ANO-CALENDÁRIO: médias mensais de cada ano e o
 * honorário vigente no fim de cada um. É a base da Análise de Dissídio.
 */
export function getPerfilEmpresas(
  params: { anos: number[]; detalhado?: boolean; regime?: string; codigoempresa?: number }
): Promise<PerfilResponse> {
  const q = new URLSearchParams();
  q.set("anos", params.anos.join(","));
  if (params.detalhado) q.set("detalhado", "true");
  if (params.regime) q.set("regime", params.regime);
  if (params.codigoempresa) q.set("codigoempresa", String(params.codigoempresa));
  return get<PerfilResponse>(`/empresas/perfil?${q.toString()}`);
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

/**
 * ICMS DIFAL — referência real por empresa/estabelecimento/competência/tipo.
 * Painel de leitura em Apuração de Impostos; `meses` é o tamanho da janela
 * (1–36, padrão 6 na própria API).
 */
export function getIcmsDifal(
  params: { meses?: number; cnpj?: string; codigoempresa?: number; competencia?: string; tipo_imposto?: string; incluir_zerados?: boolean } = {}
): Promise<IcmsDifalResponse> {
  const q = new URLSearchParams();
  if (params.meses) q.set("meses", String(params.meses));
  if (params.cnpj) q.set("cnpj", params.cnpj);
  if (params.codigoempresa) q.set("codigoempresa", String(params.codigoempresa));
  if (params.competencia) q.set("competencia", params.competencia);
  if (params.tipo_imposto) q.set("tipo_imposto", params.tipo_imposto);
  if (params.incluir_zerados) q.set("incluir_zerados", "true");
  const qs = q.toString() ? `?${q.toString()}` : "";
  return get<IcmsDifalResponse>(`/fiscal/icms-difal${qs}`);
}

/** Funcionários ativos (sem dados de salário) — usado só como sugestão na Folha de Pagamento. */
export function getFuncionariosAtivos(cnpj?: string): Promise<FuncionariosAtivosResponse> {
  const qs = cnpj ? `?cnpj=${encodeURIComponent(cnpj)}` : "";
  return get<FuncionariosAtivosResponse>(`/rh/funcionarios-ativos${qs}`);
}

export function hasApiKey(): boolean {
  return Boolean(KEY);
}

// ---------------------------------------------------------------------------
// Cadastro de Empresa (escrita) — migrado de cadastro-empresa.js do Paralegal
// System (index.html antigo). Diferente de tudo acima, isto ESCREVE no
// Questor (cria empresa + sócios). A QUESTOR_API_KEY hoje está documentada
// como "somente-leitura" — os endpoints de escrita abaixo são o melhor
// palpite a partir do comportamento do sistema antigo (POST em
// "/cadastro-empresa" com {dados, dry_run, confirmar}, resposta com
// {ok, codigoempresa, codigocliente, tabelas, avisos} ou {erro/detail}).
// Se a chave/API real usar outro caminho, ajustar só as constantes de path
// abaixo — o resto (validação, tipos, dry-run) não muda.
// ---------------------------------------------------------------------------

async function post<T>(path: string, body: unknown): Promise<{ ok: boolean; status: number; corpo: T }> {
  if (!KEY) {
    throw new QuestorError("QUESTOR_API_KEY não configurada no servidor. Defina a variável de ambiente.", 500);
  }
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": KEY },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  let corpo: T;
  try {
    corpo = (await res.json()) as T;
  } catch {
    corpo = {} as T;
  }
  return { ok: res.ok, status: res.status, corpo };
}

export interface LookupItem {
  codigo: string;
  descricao: string;
  [chave: string]: unknown;
}

const LOOKUP_PATHS: Record<string, string> = {
  "naturezas-juridicas": "/lookups/naturezas-juridicas",
  enquadramentos: "/lookups/enquadramentos",
  "tabelas-feriado": "/lookups/tabelas-feriado",
  "tipos-logradouro": "/lookups/tipos-logradouro",
  estados: "/lookups/estados",
};

export type TipoLookupCadastro = keyof typeof LOOKUP_PATHS;

/** Listas fixas usadas no formulário de Cadastro de Empresa (natureza jurídica, enquadramento, tabela de feriado, tipo de logradouro, estados). */
export function getLookupCadastroEmpresa(tipo: TipoLookupCadastro): Promise<LookupItem[]> {
  const path = LOOKUP_PATHS[tipo];
  if (!path) throw new QuestorError(`Lookup desconhecido: ${tipo}`, 400);
  return get<LookupItem[]>(path);
}

/** Municípios de uma UF — usado no formulário de Cadastro de Empresa. */
export function getLookupMunicipios(uf: string): Promise<LookupItem[]> {
  return get<LookupItem[]>(`/lookups/municipios?uf=${encodeURIComponent(uf)}`);
}

/** Busca de CNAE por texto ou código — usado no formulário de Cadastro de Empresa. */
export function buscarCnaes(q: string): Promise<LookupItem[]> {
  return get<LookupItem[]>(`/lookups/cnaes?q=${encodeURIComponent(q)}`);
}

/** Sugere o próximo código de empresa livre num intervalo (padrão 1–1999, igual ao Paralegal System antigo). */
export async function proximoCodigoCadastroEmpresa(inicio = 1, fim = 1999): Promise<string | null> {
  const resp = await get<{ dados?: Array<{ codigo?: string | number }> } | Array<{ codigo?: string | number }>>(
    `/cadastro/proximo-codigo?inicio=${inicio}&fim=${fim}`
  );
  const lista = Array.isArray(resp) ? resp : (resp.dados ?? []);
  const codigo = lista[0]?.codigo;
  return codigo != null ? String(codigo) : null;
}

export interface SocioCadastroEmpresa {
  nomesocio: string;
  inscrfederal: string;
  datanasc?: string;
  datainicial: string;
  estadocivil?: string;
  numerorg?: string;
  siglaestadorg?: string;
  datarg?: string;
  nomemae: string;
  nomepai: string;
  declarafisicaescrit?: string;
  quantcotas?: string;
  percentcotas?: string;
  dddfone?: string;
  numerofone?: string;
  email?: string;
}

export interface DadosCadastroEmpresa {
  codigoempresa: string;
  nomeempresa: string;
  nomefantasia?: string;
  inscrfederal: string;
  codigonaturjurid: string;
  tipoenquad: string;
  codigotabferiado: string;
  datainicioativ: string;
  codigoativfederal: string;
  codigotipolograd: string;
  enderecoestab: string;
  numenderestab: string;
  complenderestab?: string;
  bairroenderestab?: string;
  siglaestado: string;
  codigomunic: string;
  cependerestab?: string;
  dddfone?: string;
  numerofone?: string;
  email?: string;
  socios: SocioCadastroEmpresa[];
}

export interface RespostaCadastroEmpresa {
  ok?: boolean;
  codigoempresa?: string | number;
  codigocliente?: string | number;
  tabelas?: string[];
  avisos?: string[];
  erro?: unknown;
  detail?: unknown;
}

/**
 * Cria (ou pré-visualiza, com dryRun=true) uma empresa nova no Questor, igual
 * ao POST /api/cadastro-empresa do Paralegal System antigo. Só realmente
 * grava quando dryRun=false e confirmar=true — mesma trava dupla do sistema
 * original (o "Pré-visualizar" chama com dry_run, o "Confirmar" chama com
 * confirmar:true).
 */
export async function criarCadastroEmpresa(
  dados: DadosCadastroEmpresa,
  opts: { dryRun: boolean; confirmar: boolean }
): Promise<{ ok: boolean; status: number; corpo: RespostaCadastroEmpresa }> {
  return post<RespostaCadastroEmpresa>("/cadastro-empresa", { dados, dry_run: opts.dryRun, confirmar: opts.confirmar });
}
