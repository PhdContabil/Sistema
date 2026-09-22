// Acesso ao Supabase para o estado dos jobs do Robô Zen (simulações,
// empresas de uma simulação, envios reais, lotes de envio, tokens de
// confirmação). Ver migration_robo_zen.sql para o esquema completo.
//
// Só roda no servidor (service role) — reaproveita o mesmo cliente
// Supabase já usado pelo resto do Núcleo Contábil.

import { supabaseAdmin } from "../societario/supabase";
import type { ArquivoContrato } from "./empresas-sharepoint";

export type StatusSimulacao = "mapeando" | "processando" | "concluida" | "erro" | "parada";
export type StatusLoteEnvio = "processando" | "concluida" | "erro" | "parada";

export interface PastaTopoSnapshot {
  id: string;
  name: string;
}

export interface SimulacaoRow {
  id: string;
  status: StatusSimulacao;
  criado_por: string;
  criado_em: string;
  iniciado_em: string | null;
  terminado_em: string | null;
  pastas_raiz: PastaTopoSnapshot[];
  pastas_mapeadas: number;
  total_empresas: number;
  empresas_processadas: number;
  empresas_prontas: number;
  cursor_processamento: number;
  empresa_atual: string | null;
  parar_pedido: boolean;
  erro: string | null;
}

export interface DocumentoRef {
  id: string;
  nome: string;
}

export interface SimulacaoEmpresaRow {
  id: string;
  simulacao_id: string;
  codigo: string;
  nome: string;
  pasta_item_id: string;
  pasta_caminho: string;
  grupo_nome: string | null;
  processada: boolean;
  pronta: boolean;
  motivo: string | null;
  status: string | null;
  cnpj: string | null;
  qtd_documentos_elegiveis: number;
  documentos_elegiveis: DocumentoRef[];
  qtd_documentos_escaneados: number;
  documentos_escaneados: string[];
  qtd_documentos_ignorados: number;
  documentos_ignorados: string[];
  documento_cnpj_origem: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface EnvioRow {
  id: string;
  empresa_codigo: string;
  empresa_nome: string;
  cnpj: string;
  arquivo_nome: string;
  documento_id_questor: string;
  codigo_categoria_questor: string | null;
  codigo_cliente_questor: string | null;
  enviado_por: string;
  enviado_em: string;
}

export interface LoteEnvioRow {
  id: string;
  simulacao_origem_id: string;
  status: StatusLoteEnvio;
  criado_por: string;
  criado_em: string;
  terminado_em: string | null;
  total_empresas_prontas: number;
  cursor_processamento: number;
  empresas_processadas: number;
  empresas_enviadas: number;
  empresas_ja_enviadas: number;
  documentos_enviados: number;
  documentos_com_erro: number;
  erros: string[];
  empresa_atual: string | null;
  parar_pedido: boolean;
  erro: string | null;
}

export interface EnvioPendenteRow {
  token: string;
  empresa_codigo: string;
  empresa_nome: string;
  cnpj: string;
  documentos: DocumentoRef[];
  criado_por: string;
  criado_em: string;
  usado: boolean;
}

function db() {
  return supabaseAdmin();
}

async function assertOk<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as T;
}

// ------------------------------------------------------------------
// robo_zen_simulacoes
// ------------------------------------------------------------------

export async function criarSimulacao(criadoPor: string, pastasRaiz: PastaTopoSnapshot[]): Promise<SimulacaoRow> {
  return assertOk(
    db()
      .from("robo_zen_simulacoes")
      .insert({
        criado_por: criadoPor,
        status: "mapeando",
        iniciado_em: new Date().toISOString(),
        pastas_raiz: pastasRaiz,
      })
      .select()
      .single()
  );
}

export async function obterSimulacao(id: string): Promise<SimulacaoRow | null> {
  const { data, error } = await db().from("robo_zen_simulacoes").select().eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** A simulação em andamento mais recente ('mapeando' ou 'processando'), se houver. */
export async function obterSimulacaoAtiva(): Promise<SimulacaoRow | null> {
  const { data, error } = await db()
    .from("robo_zen_simulacoes")
    .select()
    .in("status", ["mapeando", "processando"])
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listarSimulacoesRecentes(limite = 10): Promise<SimulacaoRow[]> {
  return assertOk(db().from("robo_zen_simulacoes").select().order("criado_em", { ascending: false }).limit(limite));
}

export async function atualizarSimulacao(id: string, patch: Partial<SimulacaoRow>): Promise<SimulacaoRow> {
  return assertOk(db().from("robo_zen_simulacoes").update(patch).eq("id", id).select().single());
}

// ------------------------------------------------------------------
// robo_zen_simulacao_empresas
// ------------------------------------------------------------------

export interface NovaEmpresaSimulacao {
  codigo: string;
  nome: string;
  pastaItemId: string;
  pastaCaminho: string;
  grupoNome: string | null;
}

/** Insere (ou atualiza, se já existir o mesmo código nesta simulação) as
 * empresas encontradas ao mapear uma pasta de 1º nível. */
export async function inserirEmpresasMapeadas(simulacaoId: string, empresas: NovaEmpresaSimulacao[]): Promise<void> {
  if (empresas.length === 0) return;
  const linhas = empresas.map((e) => ({
    simulacao_id: simulacaoId,
    codigo: e.codigo,
    nome: e.nome,
    pasta_item_id: e.pastaItemId,
    pasta_caminho: e.pastaCaminho,
    grupo_nome: e.grupoNome,
  }));
  const { error } = await db()
    .from("robo_zen_simulacao_empresas")
    .upsert(linhas, { onConflict: "simulacao_id,codigo", ignoreDuplicates: false });
  if (error) throw new Error(error.message);
}

export async function contarEmpresasMapeadas(simulacaoId: string): Promise<number> {
  const { count, error } = await db()
    .from("robo_zen_simulacao_empresas")
    .select("id", { count: "exact", head: true })
    .eq("simulacao_id", simulacaoId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Próxima empresa ainda não processada desta simulação (ordem estável de criação). */
export async function proximaEmpresaParaProcessar(simulacaoId: string): Promise<SimulacaoEmpresaRow | null> {
  const { data, error } = await db()
    .from("robo_zen_simulacao_empresas")
    .select()
    .eq("simulacao_id", simulacaoId)
    .eq("processada", false)
    .order("criado_em", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function atualizarEmpresaSimulacao(
  id: string,
  patch: Partial<SimulacaoEmpresaRow>
): Promise<SimulacaoEmpresaRow> {
  return assertOk(
    db()
      .from("robo_zen_simulacao_empresas")
      .update({ ...patch, atualizado_em: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()
  );
}

export async function listarEmpresasDaSimulacao(simulacaoId: string): Promise<SimulacaoEmpresaRow[]> {
  return assertOk(
    db()
      .from("robo_zen_simulacao_empresas")
      .select()
      .eq("simulacao_id", simulacaoId)
      .order("nome", { ascending: true })
  );
}

export async function listarEmpresasProntas(simulacaoId: string): Promise<SimulacaoEmpresaRow[]> {
  return assertOk(
    db()
      .from("robo_zen_simulacao_empresas")
      .select()
      .eq("simulacao_id", simulacaoId)
      .eq("pronta", true)
      .order("nome", { ascending: true })
  );
}

/** Busca por nome/código dentro das empresas já mapeadas por uma simulação — usado
 * por "consultar uma empresa específica" antes de cair numa busca ao vivo. */
export async function buscarEmpresaMapeada(simulacaoId: string, busca: string): Promise<SimulacaoEmpresaRow | null> {
  const buscaNormalizada = busca.trim().toLowerCase();
  const { data, error } = await db()
    .from("robo_zen_simulacao_empresas")
    .select()
    .eq("simulacao_id", simulacaoId)
    .or(`codigo.eq.${buscaNormalizada},nome.ilike.%${busca.trim()}%`)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// ------------------------------------------------------------------
// robo_zen_envios (auditoria permanente)
// ------------------------------------------------------------------

export interface NovoEnvio {
  empresaCodigo: string;
  empresaNome: string;
  cnpj: string;
  arquivoNome: string;
  documentoIdQuestor: string;
  codigoCategoriaQuestor?: string | null;
  codigoClienteQuestor?: string | null;
  enviadoPor: string;
}

/** Registra um envio — idempotente: se (empresaCodigo, arquivoNome) já existir, não duplica. */
export async function registrarEnvio(envio: NovoEnvio): Promise<void> {
  const { error } = await db()
    .from("robo_zen_envios")
    .upsert(
      {
        empresa_codigo: envio.empresaCodigo,
        empresa_nome: envio.empresaNome,
        cnpj: envio.cnpj,
        arquivo_nome: envio.arquivoNome,
        documento_id_questor: envio.documentoIdQuestor,
        codigo_categoria_questor: envio.codigoCategoriaQuestor ?? null,
        codigo_cliente_questor: envio.codigoClienteQuestor ?? null,
        enviado_por: envio.enviadoPor,
      },
      { onConflict: "empresa_codigo,arquivo_nome", ignoreDuplicates: true }
    );
  if (error) throw new Error(error.message);
}

/** (código da empresa, nome do arquivo) de tudo que já foi enviado de
 * verdade antes — usado pra pular no envio em lote e nunca duplicar. */
export async function chavesJaEnviadas(): Promise<Set<string>> {
  const linhas = await assertOk<{ empresa_codigo: string; arquivo_nome: string }[]>(
    db().from("robo_zen_envios").select("empresa_codigo,arquivo_nome")
  );
  return new Set(linhas.map((l) => `${l.empresa_codigo}\u0000${l.arquivo_nome}`));
}

export function chaveEnvio(codigo: string, arquivoNome: string): string {
  return `${codigo}\u0000${arquivoNome}`;
}

// ------------------------------------------------------------------
// robo_zen_lotes_envio
// ------------------------------------------------------------------

export async function criarLoteEnvio(
  criadoPor: string,
  simulacaoOrigemId: string,
  totalEmpresasProntas: number
): Promise<LoteEnvioRow> {
  return assertOk(
    db()
      .from("robo_zen_lotes_envio")
      .insert({
        criado_por: criadoPor,
        simulacao_origem_id: simulacaoOrigemId,
        status: "processando",
        total_empresas_prontas: totalEmpresasProntas,
      })
      .select()
      .single()
  );
}

export async function obterLoteEnvio(id: string): Promise<LoteEnvioRow | null> {
  const { data, error } = await db().from("robo_zen_lotes_envio").select().eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function obterLoteEnvioAtivo(): Promise<LoteEnvioRow | null> {
  const { data, error } = await db()
    .from("robo_zen_lotes_envio")
    .select()
    .eq("status", "processando")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function atualizarLoteEnvio(id: string, patch: Partial<LoteEnvioRow>): Promise<LoteEnvioRow> {
  return assertOk(db().from("robo_zen_lotes_envio").update(patch).eq("id", id).select().single());
}

// ------------------------------------------------------------------
// robo_zen_envios_pendentes (fluxo preparar -> confirmar, 1 empresa)
// ------------------------------------------------------------------

const TTL_ENVIO_PENDENTE_MS = 15 * 60 * 1000;

export async function criarEnvioPendente(dados: {
  empresaCodigo: string;
  empresaNome: string;
  cnpj: string;
  documentos: ArquivoContrato[];
  criadoPor: string;
}): Promise<EnvioPendenteRow> {
  return assertOk(
    db()
      .from("robo_zen_envios_pendentes")
      .insert({
        empresa_codigo: dados.empresaCodigo,
        empresa_nome: dados.empresaNome,
        cnpj: dados.cnpj,
        documentos: dados.documentos,
        criado_por: dados.criadoPor,
      })
      .select()
      .single()
  );
}

/** Consome um token (marca usado=true) e devolve os dados — null se não
 * existir, já tiver sido usado, ou tiver expirado (15 min). */
export async function consumirEnvioPendente(token: string): Promise<EnvioPendenteRow | null> {
  const { data, error } = await db().from("robo_zen_envios_pendentes").select().eq("token", token).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  if (data.usado) return null;
  const idadeMs = Date.now() - new Date(data.criado_em).getTime();
  if (idadeMs > TTL_ENVIO_PENDENTE_MS) return null;

  const { error: errUpdate } = await db()
    .from("robo_zen_envios_pendentes")
    .update({ usado: true })
    .eq("token", token)
    .eq("usado", false);
  if (errUpdate) throw new Error(errUpdate.message);
  return data;
}
