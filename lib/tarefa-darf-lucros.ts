// Cria no Tareffa a tarefa avulsa "Guia DARF Lucros ou Dividendos IRRF 1841" quando um lançamento de
// Lucros Distribuídos tem IRRF retido (SERVIDOR). Mesmo endpoint que o Societário já usa
// (POST /services/servicos_programados/avulso). O responsável é o do Departamento Fiscal da empresa
// (GET /services/empresas/{id}/links/equipes/responsaveis), como está cadastrado no Tareffa.
//
// Nunca lança: o lançamento no Questor já deu certo quando isto roda; falhar aqui só vira aviso.
import { tokenTareffa, invalidarTokenTareffa } from "./tareffa-documentos";
import { obterRegimeEmpresa } from "./tareffa-regime";
import {
  escolherResponsavelFiscal, escolherServicoDarf, montarCorpoAvulso, vencimentoDarf, competenciaTareffa,
  type RegistroResponsavel,
} from "./tarefa-darf-lucros-formato";

const API = "https://prd-api-oauth-tareffa.ottimizza.dev/services";
const TIMEOUT_MS = 20_000;
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

export interface DadosTarefaDarf {
  codigoempresa: number;
  competencia: string; // AAAA-MM
  nomeEmpresa: string | null;
  nomeSocio: string | null;
  codigosocio: number;
  rendimento: number;
  baseIrrf: number;
  imposto: number;
  lancadoPor: string;
}

export type ResultadoTarefaDarf =
  | { estado: "criada"; mensagem: string; responsavel: string; vencimento: string }
  | { estado: "nao_aplica"; mensagem: string }
  | { estado: "falhou"; mensagem: string };

async function chamar(path: string, init: RequestInit = {}, tentou401 = false): Promise<{ status: number; json: unknown }> {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await tokenTareffa()}`, "Content-Type": "application/json", Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (r.status === 401 && !tentou401) { invalidarTokenTareffa(); return chamar(path, init, true); }
  const txt = await r.text().catch(() => "");
  let json: unknown = {};
  try { json = txt.trim() ? JSON.parse(txt) : {}; } catch { json = { message: txt.slice(0, 200) }; }
  return { status: r.status, json };
}

let cacheServico: { em: number; v: { id: number; nome: string } | null } | null = null;

/** Serviço do Tareffa: TAREFFA_SERVICO_DARF_LUCROS_ID, se definido; senão procura pelo nome (cache de 10 min). */
async function servicoDarf(): Promise<{ id: number; nome: string } | null> {
  const fixo = Number(process.env.TAREFFA_SERVICO_DARF_LUCROS_ID);
  if (Number.isInteger(fixo) && fixo > 0) return { id: fixo, nome: "Guia DARF Lucros ou Dividendos IRRF 1841" };
  if (cacheServico && Date.now() - cacheServico.em < 10 * 60_000) return cacheServico.v;
  const todos: Array<{ id: number; nome: string }> = [];
  for (let page = 0; page < 10; page++) {
    const { json } = await chamar(`/servicos?page_index=${page}&page_size=200&ativo=true`);
    const rec = ((json as { records?: Array<{ id: number; nome: string }> }).records ?? []);
    todos.push(...rec.map((x) => ({ id: x.id, nome: x.nome })));
    if (rec.length < 200) break;
  }
  const v = escolherServicoDarf(todos);
  cacheServico = { em: Date.now(), v };
  return v;
}

/** Usuário do Tareffa que corresponde ao responsável (pelo nome; cai no id do cadastro se não achar). */
async function usuarioDe(resp: { id: number; nome: string }): Promise<number> {
  try {
    const alvo = sem(resp.nome);
    const { json } = await chamar(`/usuarios?page_index=0&page_size=50&nome=${encodeURIComponent(alvo.split(/\s+/)[0])}`);
    const internos = ((json as { records?: Array<{ id: number; nome: string; tipoUsuario?: number }> }).records ?? []).filter((u) => u.tipoUsuario === 1);
    const u = internos.find((x) => x.id === resp.id) ?? internos.find((x) => sem(x.nome) === alvo);
    if (u) return u.id;
  } catch { /* usa o id do cadastro */ }
  return resp.id;
}

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function criarTarefaDarfLucros(d: DadosTarefaDarf): Promise<ResultadoTarefaDarf> {
  if (!(d.imposto > 0)) return { estado: "nao_aplica", mensagem: "Sem IRRF retido: não há guia a pagar." };
  try {
    const emp = await obterRegimeEmpresa(d.codigoempresa);
    if (!emp?.tareffaId) return { estado: "falhou", mensagem: `Empresa ${d.codigoempresa} não encontrada no Tareffa.` };

    const servico = await servicoDarf();
    if (!servico) return { estado: "falhou", mensagem: 'Serviço "Guia DARF Lucros ou Dividendos IRRF 1841" não encontrado (ou ambíguo) no Tareffa.' };

    // Responsáveis ficam na empresa da contabilidade (id da URL /empresas/{id}); a tarefa usa o id do cliente.
    const { status: sr, json: jr } = await chamar(`/empresas/${emp.empresaContabilidadeId ?? emp.tareffaId}/links/equipes/responsaveis?description=`);
    if (sr < 200 || sr >= 300) return { estado: "falhou", mensagem: `Não consegui ler os responsáveis da empresa no Tareffa (HTTP ${sr}).` };
    const fiscal = escolherResponsavelFiscal(((jr as { records?: RegistroResponsavel[] }).records ?? []));
    if (!fiscal) return { estado: "falhou", mensagem: "A empresa não tem responsável do Departamento Fiscal no Tareffa." };
    const usuarioId = await usuarioDe(fiscal);

    const comp = competenciaTareffa(d.competencia);
    const corpo = montarCorpoAvulso({
      servicoId: servico.id, clienteId: emp.tareffaId, usuarioId, competencia: d.competencia,
      referencia: `Lucros ${comp} · sócio ${d.codigosocio}`,
      observacoes: [
        `Lucros distribuídos ${comp}: ${d.nomeSocio ?? "sócio " + d.codigosocio}.`,
        `Rendimento ${reais(d.rendimento)} · base IRRF ${reais(d.baseIrrf)} · IRRF a pagar ${reais(d.imposto)}.`,
        `Criado pelo Núcleo (lançado por ${d.lancadoPor}).`,
      ].join("\n"),
    });
    const { status, json } = await chamar("/servicos_programados/avulso", { method: "POST", body: JSON.stringify(corpo) });
    const j = json as { message?: string; status?: string };
    if (status < 200 || status >= 300 || String(j.status ?? "").toLowerCase() === "error") {
      return { estado: "falhou", mensagem: `O Tareffa recusou a tarefa (HTTP ${status}): ${j.message ?? "sem detalhe"}` };
    }
    const venc = vencimentoDarf(d.competencia).split("-").reverse().join("/");
    return { estado: "criada", mensagem: `Tarefa DARF criada para ${fiscal.nome}, vencimento ${venc}.`, responsavel: fiscal.nome, vencimento: venc };
  } catch (e) {
    console.error("[tarefa-darf-lucros]", e instanceof Error ? e.name : "erro");
    return { estado: "falhou", mensagem: "Falha ao falar com o Tareffa." };
  }
}
