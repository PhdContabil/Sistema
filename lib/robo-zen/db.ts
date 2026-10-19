// Acesso ao Supabase para o estado dos jobs do Robô Zen (simulações,
// empresas de uma simulação, envios reais, lotes de envio, tokens de
// confirmação). Ver migration_robo_zen.sql para o esquema completo.
//
// Só roda no servidor (service role) — reaproveita o mesmo cliente
// Supabase já usado pelo resto do Núcleo Contábil.

import { supabaseAdmin } from "../societario/supabase";
import type { ArquivoContrato } from "./empresas-sharepoint";
import type { BuscaParcial, DocTentado, DocVencedor } from "./busca-parcial";

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
  /** Trava do passo em andamento: enquanto estiver no futuro, só quem a tomou
   * mexe no lote (ver `tomarPassoDoLote`). Null = livre. */
  passo_ate: string | null;
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

/** Uma consulta do Supabase devolve NO MÁXIMO 1.000 linhas (limite padrão da API),
 * e corta o resto SEM avisar. Tabela que pode passar disso (o registro de envios
 * já passa de 1.800 documentos numa rodada) tem de ser lida página a página. */
const TAMANHO_PAGINA_LEITURA = 1000;

/** Lê TODAS as linhas de uma consulta. `montar(de, ate)` monta a consulta com
 * `select(..., { count: "exact" })`, ordem ESTÁVEL e `.range(de, ate)`. */
async function lerTudo<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }>
): Promise<T[]> {
  const todas: T[] = [];
  let de = 0;
  for (;;) {
    const { data, error, count } = await montar(de, de + TAMANHO_PAGINA_LEITURA - 1);
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as T[];
    todas.push(...pagina);
    // Avança pelo que CHEGOU (não pelo tamanho pedido): um projeto com o limite da
    // API abaixo de 1.000 devolve páginas menores, e pular linhas seria pior que
    // o corte que esta função existe pra evitar.
    de += pagina.length;
    if (pagina.length === 0) break;
    if (typeof count === "number") {
      if (todas.length >= count) break;
    } else if (pagina.length < TAMANHO_PAGINA_LEITURA) {
      break;
    }
  }
  return todas;
}

/** A migração migration_robo_zen_envio_seguro.sql ainda não foi aplicada? Diz isso
 * com todas as letras em vez de um "column does not exist" solto. */
function explicarFaltaDeMigracao(mensagem: string): string {
  if (/passo_ate|robo_zen_envio_reservas/i.test(mensagem)) {
    return (
      `${mensagem} — a migração do banco migration_robo_zen_envio_seguro.sql ainda não foi aplicada ` +
      "(o envio fica parado de propósito enquanto isso, para não arriscar duplicar)."
    );
  }
  return mensagem;
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

/** Configuração do Robô Zen: variável de ambiente primeiro, tabela `app_config`
 * (chave/valor, a mesma do resto do Núcleo) depois. Qualquer falha de leitura
 * vira `null` ("não configurado") — quem usa isto trata ausência como desligado. */
export async function lerConfig(chave: string): Promise<string | null> {
  const doEnv = process.env[chave]?.trim();
  if (doEnv) return doEnv;
  try {
    const { data, error } = await db().from("app_config").select("valor").eq("chave", chave).maybeSingle();
    if (error) return null;
    const valor = typeof data?.valor === "string" ? data.valor.trim() : "";
    return valor || null;
  } catch {
    return null;
  }
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

/** Progresso REAL de uma simulação, contado nas linhas por empresa (a fonte da
 * verdade: é o que a tabela de resultado mostra). Os contadores do cabeçalho
 * (`empresas_processadas`/`empresas_prontas`) vêm daqui — nunca de "lê o valor,
 * soma 1 e grava", que perde contagens quando dois passos andam ao mesmo tempo
 * (o agendador e uma tela aberta, ou um passo lento que atravessa o minuto
 * seguinte): os dois leem o mesmo valor antigo e o último a gravar vence. */
export async function contarProgressoSimulacao(simulacaoId: string): Promise<{ processadas: number; prontas: number }> {
  const contar = async (somenteProntas: boolean): Promise<number> => {
    let consulta = db()
      .from("robo_zen_simulacao_empresas")
      .select("id", { count: "exact", head: true })
      .eq("simulacao_id", simulacaoId)
      .eq("processada", true);
    if (somenteProntas) consulta = consulta.eq("pronta", true);
    const { count, error } = await consulta;
    if (error) throw new Error(error.message);
    return count ?? 0;
  };
  const [processadas, prontas] = await Promise.all([contar(false), contar(true)]);
  return { processadas, prontas };
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
  // Ordem estável (nome e, no empate, código): a leitura é em páginas.
  return lerTudo<SimulacaoEmpresaRow>((de, ate) =>
    db()
      .from("robo_zen_simulacao_empresas")
      .select("*", { count: "exact" })
      .eq("simulacao_id", simulacaoId)
      .order("nome", { ascending: true })
      .order("codigo", { ascending: true })
      .range(de, ate)
  );
}

/** Empresas PRONTA de uma simulação, na ordem em que o envio em lote as percorre
 * (nome e, no empate, código — o lote guarda a posição, então a ordem não pode
 * mudar de uma chamada pra outra). */
export async function listarEmpresasProntas(simulacaoId: string): Promise<SimulacaoEmpresaRow[]> {
  return lerTudo<SimulacaoEmpresaRow>((de, ate) =>
    db()
      .from("robo_zen_simulacao_empresas")
      .select("*", { count: "exact" })
      .eq("simulacao_id", simulacaoId)
      .eq("pronta", true)
      .order("nome", { ascending: true })
      .order("codigo", { ascending: true })
      .range(de, ate)
  );
}

/** Busca por nome/código dentro das empresas já mapeadas por uma simulação — usado
 * por "consultar uma empresa específica" antes de cair numa busca ao vivo. */
export async function buscarEmpresaMapeada(simulacaoId: string, busca: string): Promise<SimulacaoEmpresaRow | null> {
  const texto = busca.trim();
  if (!texto) return null;
  // Mesma ordem da busca ao vivo (lib/robo-zen/busca-empresa.ts): código EXATO, depois nome igual, depois nome
  // que contém. Antes era um único OR com limit(1) sem ordem — se o código também aparecesse dentro do nome de
  // outra empresa (ex.: CPF no nome), qual vinha era acaso. Cada etapa é uma consulta própria e ordenada.
  const base = () => db().from("robo_zen_simulacao_empresas").select().eq("simulacao_id", simulacaoId);

  const porCodigo = await base().eq("codigo", texto).limit(1).maybeSingle();
  if (porCodigo.error) throw new Error(porCodigo.error.message);
  if (porCodigo.data) return porCodigo.data;

  // % e _ digitados valem como texto comum (no ilike são curingas).
  const literal = texto.replace(/[\\%_]/g, (c) => "\\" + c);
  const porNomeIgual = await base().ilike("nome", literal).order("nome", { ascending: true }).order("codigo", { ascending: true }).limit(1).maybeSingle();
  if (porNomeIgual.error) throw new Error(porNomeIgual.error.message);
  if (porNomeIgual.data) return porNomeIgual.data;

  const porNomeParcial = await base().ilike("nome", `%${literal}%`).order("nome", { ascending: true }).order("codigo", { ascending: true }).limit(1).maybeSingle();
  if (porNomeParcial.error) throw new Error(porNomeParcial.error.message);
  return porNomeParcial.data;
}

/** Uma empresa de uma simulação pelo código exato — usado pra baixar um
 * contrato: o id do documento no SharePoint sai DAQUI (do que a própria
 * simulação gravou), nunca de um parâmetro vindo do navegador. */
export async function obterEmpresaDaSimulacao(simulacaoId: string, codigo: string): Promise<SimulacaoEmpresaRow | null> {
  const { data, error } = await db()
    .from("robo_zen_simulacao_empresas")
    .select()
    .eq("simulacao_id", simulacaoId)
    .eq("codigo", codigo)
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

/** Tudo o que já foi enviado de verdade, de todas as empresas — usado pra MOSTRAR
 * a situação de envio no resultado da simulação. Lido em páginas (o registro passa
 * de 1.000 linhas). Quem decide se um documento vai ou não ao Zen NÃO usa isto:
 * usa `enviosDaEmpresa` (só a empresa em questão) e a reserva. */
export async function todosOsEnvios(): Promise<{ empresa_codigo: string; arquivo_nome: string; cnpj: string; enviado_em: string }[]> {
  return lerTudo((de, ate) =>
    db()
      .from("robo_zen_envios")
      .select("empresa_codigo,arquivo_nome,cnpj,enviado_em", { count: "exact" })
      .order("id", { ascending: true })
      .range(de, ate)
  );
}

/** Envios já registrados de UMA empresa (do mais recente pro mais antigo) —
 * a varredura usa isto pra saber o que já foi pro Zen e o que é novo. Qualquer
 * falha PROPAGA (quem chama decide): na dúvida sobre o que já foi enviado, a
 * empresa não pode ser dada como pronta. */
export async function enviosDaEmpresa(
  codigo: string
): Promise<{ arquivo_nome: string; cnpj: string; enviado_em: string }[]> {
  return assertOk(
    db()
      .from("robo_zen_envios")
      .select("arquivo_nome,cnpj,enviado_em")
      .eq("empresa_codigo", codigo)
      .order("enviado_em", { ascending: false })
  );
}

// ------------------------------------------------------------------
// robo_zen_busca_parcial — "continuar de onde parou" (lib/robo-zen/busca-parcial.ts)
// ------------------------------------------------------------------

/** O que ficou guardado da busca do CNPJ de uma empresa (ou null). Qualquer
 * falha PROPAGA — quem chama decide (preparar-empresa.ts trata como "sem
 * memória" e segue como antes, sem continuar de onde parou). */
export async function obterBuscaParcial(codigo: string): Promise<BuscaParcial | null> {
  const { data, error } = await db()
    .from("robo_zen_busca_parcial")
    .select("documentos,vencedor,passos,atualizado_em")
    .eq("empresa_codigo", codigo)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    documentos: Array.isArray(data.documentos) ? (data.documentos as DocTentado[]) : [],
    vencedor: (data.vencedor as DocVencedor | null) ?? null,
    passos: Number(data.passos) || 0,
    atualizado_em: String(data.atualizado_em),
  };
}

export async function salvarBuscaParcial(
  codigo: string,
  busca: { documentos: DocTentado[]; vencedor: DocVencedor | null; passos: number }
): Promise<void> {
  const { error } = await db()
    .from("robo_zen_busca_parcial")
    .upsert(
      {
        empresa_codigo: codigo,
        documentos: busca.documentos,
        vencedor: busca.vencedor,
        passos: busca.passos,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "empresa_codigo" }
    );
  if (error) throw new Error(error.message);
}

export async function limparBuscaParcial(codigo: string): Promise<void> {
  const { error } = await db().from("robo_zen_busca_parcial").delete().eq("empresa_codigo", codigo);
  if (error) throw new Error(error.message);
}

// ------------------------------------------------------------------
// robo_zen_envio_reservas — "quem reserva primeiro envia" (lib/robo-zen/envio-seguro.ts)
// ------------------------------------------------------------------

/** Reserva (empresa, arquivo) de forma atômica: a chave primária garante que
 * só UMA reserva existe por vez. "ja_reservado" = outro envio já segura esse
 * documento (em andamento, ou interrompido sem certeza se o Zen gravou). */
export async function reservarEnvio(
  empresaCodigo: string,
  arquivoNome: string,
  reservadoPor: string
): Promise<"reservado" | "ja_reservado"> {
  const { error } = await db()
    .from("robo_zen_envio_reservas")
    .insert({ empresa_codigo: empresaCodigo, arquivo_nome: arquivoNome, reservado_por: reservadoPor });
  if (!error) return "reservado";
  if (error.code === "23505") return "ja_reservado";
  throw new Error(explicarFaltaDeMigracao(error.message));
}

export async function liberarReservaEnvio(empresaCodigo: string, arquivoNome: string): Promise<void> {
  const { error } = await db()
    .from("robo_zen_envio_reservas")
    .delete()
    .eq("empresa_codigo", empresaCodigo)
    .eq("arquivo_nome", arquivoNome);
  if (error) throw new Error(error.message);
}

/** Reservas que sobraram (envios interrompidos sem certeza) — a tela mostra como
 * "ENVIO INTERROMPIDO". Em andamento agora também aparecem por instantes. */
export async function listarReservasEnvio(): Promise<
  { empresa_codigo: string; arquivo_nome: string; reservado_por: string; reservado_em: string }[]
> {
  return lerTudo((de, ate) =>
    db()
      .from("robo_zen_envio_reservas")
      .select("empresa_codigo,arquivo_nome,reservado_por,reservado_em", { count: "exact" })
      .order("empresa_codigo", { ascending: true })
      .order("arquivo_nome", { ascending: true })
      .range(de, ate)
  );
}

// ------------------------------------------------------------------
// robo_zen_lotes_envio
// ------------------------------------------------------------------

/** Já existe um lote com status "processando" (o banco só admite UM — ver
 * migration_robo_zen_envio_seguro.sql). */
export class LoteJaAtivoError extends Error {
  constructor() {
    super("Já tem um envio em lote rodando.");
    this.name = "LoteJaAtivoError";
  }
}

export async function criarLoteEnvio(
  criadoPor: string,
  simulacaoOrigemId: string,
  totalEmpresasProntas: number
): Promise<LoteEnvioRow> {
  const { data, error } = await db()
    .from("robo_zen_lotes_envio")
    .insert({
      criado_por: criadoPor,
      simulacao_origem_id: simulacaoOrigemId,
      status: "processando",
      total_empresas_prontas: totalEmpresasProntas,
    })
    .select()
    .single();
  if (error) {
    // Dois cliques ao mesmo tempo: a checagem "tem lote ativo?" das rotas não é
    // atômica, mas o índice único parcial do banco é — o segundo cai aqui.
    if (error.code === "23505") throw new LoteJaAtivoError();
    throw new Error(error.message);
  }
  return data as LoteEnvioRow;
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

/**
 * Toma a TRAVA do próximo passo do lote: devolve o lote se conseguiu, ou null se
 * outro navegador/aba está no meio de um passo (ou esperando entre tentativas).
 * Cada tentativa é UM comando atômico do banco ("só atualiza se estiver livre ou
 * vencida"), então dois navegadores nunca processam a mesma empresa ao mesmo tempo.
 * A trava vence sozinha em `duracaoMs` (a função da Vercel morre aos 60 s e não
 * consegue devolvê-la), e é devolvida ao fim de cada passo.
 */
export async function tomarPassoDoLote(id: string, agoraMs: number, duracaoMs: number): Promise<LoteEnvioRow | null> {
  const ate = new Date(agoraMs + duracaoMs).toISOString();
  const tentativas = [
    () => db().from("robo_zen_lotes_envio").update({ passo_ate: ate }).eq("id", id).eq("status", "processando").is("passo_ate", null).select(),
    () =>
      db()
        .from("robo_zen_lotes_envio")
        .update({ passo_ate: ate })
        .eq("id", id)
        .eq("status", "processando")
        .lt("passo_ate", new Date(agoraMs).toISOString())
        .select(),
  ];
  for (const tentar of tentativas) {
    const { data, error } = await tentar();
    if (error) throw new Error(explicarFaltaDeMigracao(error.message));
    if (data && data.length > 0) return data[0] as LoteEnvioRow;
  }
  return null;
}

export async function liberarPassoDoLote(id: string): Promise<void> {
  const { error } = await db().from("robo_zen_lotes_envio").update({ passo_ate: null }).eq("id", id);
  if (error) throw new Error(error.message);
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
