// Pedidos "Incluir tarefa" do DP (tickets do Trabalhista) -> programação avulsa no Tareffa.
// PILOTO, só em localhost por enquanto. Pedido guardado como JSON no bucket privado
// "cache-nucleo" (sem tabela nova). A chamada ao Tareffa só acontece no botão
// "Aprovar e gerar" (TI), e cada pedido pode ser simulado antes.
//
// Regras:
//  - Uma empresa por pedido (código ERP "<cod>-<estab>", ex.: 1467-1), vários serviços, 1 a 3 meses.
//  - "Mês" = mês de geração/vencimento. Sem dia fixo, manda competência = mês anterior
//    (no teste da 1467-1, gerar novembro deu competência 10/2026) e o Tareffa calcula o vencimento.
//    Com dia fixo, manda dataVencimento = dia X do mês.
//  - Referência "Ticket #<id>": a API atualiza em vez de duplicar quando já existe pendente igual.
//  - Responsável omitido: o Tareffa usa o configurado no serviço.
import { createClient } from "@supabase/supabase-js";
import { tokenTareffa, invalidarTokenTareffa, TareffaError } from "./tareffa-documentos";

const API = "https://prd-api-oauth-tareffa.ottimizza.dev/services";
const BUCKET = "cache-nucleo";
const ARQ = "tarefas-dp-pedidos.json";
const TIMEOUT_MS = 20_000;

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface ServicoPedido { id: number; nome: string }

export interface ItemResultado {
  servicoId: number;
  servico: string;
  mes: string; // MM/AAAA (mês de geração)
  ok: boolean;
  simulacao: boolean;
  programacaoId: number | null;
  mensagem: string;
  em: string;
}

export interface PedidoTarefaDp {
  ticketId: string;
  codigoErp: string;
  empresaNome: string | null;
  tareffaEmpresaId: number | null;
  servicos: ServicoPedido[];
  mesInicial: string; // AAAA-MM
  qtdMeses: number; // 1..3
  diaVencimento: number | null;
  responsavel: { id: number; nome: string } | null;
  observacoes: string;
  criadoPor: string;
  criadoEm: string;
  status: "pendente" | "concluido" | "com_erro";
  resultados: ItemResultado[];
}

type Registro = Record<string, PedidoTarefaDp>;

async function ler(): Promise<Registro> {
  const sb = admin();
  if (!sb) return {};
  const { data, error } = await sb.storage.from(BUCKET).download(ARQ);
  if (error || !data) return {};
  try { return JSON.parse(await data.text()) as Registro; } catch { return {}; }
}

async function salvar(reg: Registro): Promise<void> {
  const sb = admin();
  if (!sb) throw new Error("Supabase não configurado.");
  const { error } = await sb.storage.from(BUCKET).upload(ARQ, new Blob([JSON.stringify(reg)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
  if (error) throw new Error(`Não foi possível salvar o pedido: ${error.message}`);
}

export async function obterPedido(ticketId: string): Promise<PedidoTarefaDp | null> {
  return (await ler())[ticketId] ?? null;
}

// ------------------------------------------------------------------ aprovadores
// Quem pode aprovar além da T.I. (marcado na tela Tickets > Usuários; por enquanto só para o Trabalhista).
const ARQ_APROV = "tarefas-dp-aprovadores.json";

export async function lerAprovadores(): Promise<string[]> {
  const sb = admin();
  if (!sb) return [];
  const { data, error } = await sb.storage.from(BUCKET).download(ARQ_APROV);
  if (error || !data) return [];
  try { return (JSON.parse(await data.text()) as string[]).map((e) => e.toLowerCase()); } catch { return []; }
}

export async function definirAprovador(email: string, aprova: boolean): Promise<string[]> {
  const sb = admin();
  if (!sb) throw new Error("Supabase não configurado.");
  const e = email.toLowerCase();
  const atual = (await lerAprovadores()).filter((x) => x !== e);
  if (aprova) atual.push(e);
  const { error } = await sb.storage.from(BUCKET).upload(ARQ_APROV, new Blob([JSON.stringify(atual)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
  if (error) throw new Error(error.message);
  return atual;
}

// ------------------------------------------------------------------ Tareffa

async function chamar(path: string, init: RequestInit = {}, tentou401 = false): Promise<unknown> {
  const r = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await tokenTareffa()}`, "Content-Type": "application/json", Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e) => { throw new TareffaError(`Sem conexão com o Tareffa (${e instanceof Error ? e.message : e})`); });
  if (r.status === 401 && !tentou401) { invalidarTokenTareffa(); return chamar(path, init, true); }
  const txt = await r.text().catch(() => "");
  if (path.includes("avulso")) console.log("[tarefa-dp] avulso", r.status, r.headers.get("content-type"), JSON.stringify({ req: init.body, resp: txt.slice(0, 500) }));
  if (!r.ok) throw new TareffaError(`Tareffa HTTP ${r.status}: ${txt.slice(0, 300)}`);
  // A rota de programação avulsa às vezes responde 200 com corpo vazio (igual ao fluxo do Societário, que já funciona).
  if (!txt.trim()) return {};
  try { return JSON.parse(txt); } catch { throw new TareffaError(`Resposta do Tareffa não é JSON: ${txt.slice(0, 200)}`); }
}

export interface EmpresaTareffa { id: number; codigoErp: string; razaoSocial: string; situacao: number | null }

/** Empresa pelo código ERP exato (ex.: "1467-1"). Inclui inativas/rescindidas, para o aviso. */
export async function buscarEmpresaErp(codigoErp: string): Promise<EmpresaTareffa | null> {
  const erp = codigoErp.trim();
  const j = (await chamar(`/empresas/f?page_size=10&page_index=0`, {
    method: "POST",
    body: JSON.stringify({
      codigoERP: erp, codigosERP: [], razaoSocial: "", cnpj: "", matriz: null, situacao: null,
      isAtivo: false, classificacao: [], regimeTributario: [], cnaePrincipal: [],
      departamento: { id: null, descricao: "" }, responsavel: { id: null, nome: "", email: "" }, caracteristicas: [],
    }),
  })) as { records?: { id: number; codigoErp?: string; razaoSocial?: string; situacao?: number }[] };
  const x = (j.records ?? []).find((r) => (r.codigoErp ?? "").trim() === erp);
  return x ? { id: x.id, codigoErp: erp, razaoSocial: x.razaoSocial ?? "", situacao: x.situacao ?? null } : null;
}

/** Empresas por código (ex.: 1467) ou parte do nome, para o autocompletar do formulário. */
export async function buscarEmpresas(termo: string): Promise<EmpresaTareffa[]> {
  const q = termo.trim();
  if (q.length < 2) return [];
  const porCodigo = /^\d+(-\d+)?$/.test(q);
  const j = (await chamar(`/empresas/f?page_size=15&page_index=0`, {
    method: "POST",
    body: JSON.stringify({
      codigoERP: porCodigo ? q : "", codigosERP: [], razaoSocial: porCodigo ? "" : q, cnpj: "", matriz: null, situacao: null,
      isAtivo: false, classificacao: [], regimeTributario: [], cnaePrincipal: [],
      departamento: { id: null, descricao: "" }, responsavel: { id: null, nome: "", email: "" }, caracteristicas: [],
    }),
  })) as { records?: { id: number; codigoErp?: string; razaoSocial?: string; situacao?: number }[] };
  let lista = (j.records ?? []).filter((r) => r.codigoErp).map((r) => ({ id: r.id, codigoErp: String(r.codigoErp).trim(), razaoSocial: r.razaoSocial ?? "", situacao: r.situacao ?? null }));
  if (porCodigo) {
    const base = q.split("-")[0];
    lista = lista.filter((e) => e.codigoErp.split("-")[0] === base || e.codigoErp === q);
  }
  return lista.slice(0, 10);
}

export interface UsuarioTareffa { id: number; nome: string }

/** Usuários internos do Tareffa pelo nome (para o campo Responsável). */
export async function buscarUsuarios(nome: string): Promise<UsuarioTareffa[]> {
  const q = nome.trim();
  if (q.length < 2) return [];
  const j = (await chamar(`/usuarios?page_index=0&page_size=20&nome=${encodeURIComponent(q)}`)) as { records?: { id: number; nome: string; tipoUsuario?: number }[] };
  return (j.records ?? []).filter((u) => u.tipoUsuario === 1).map((u) => ({ id: u.id, nome: u.nome }));
}

// ------------------------------------------------------------------ datas

const pad = (n: number) => String(n).padStart(2, "0");
function meses(inicio: string, qtd: number): { ano: number; mes: number }[] {
  let [ano, mes] = inicio.split("-").map(Number);
  const out: { ano: number; mes: number }[] = [];
  for (let i = 0; i < qtd; i++) { out.push({ ano, mes }); mes++; if (mes > 12) { mes = 1; ano++; } }
  return out;
}
function ultimoDia(ano: number, mes: number) { return new Date(Date.UTC(ano, mes, 0)).getUTCDate(); }

// ------------------------------------------------------------------ pedido

export interface EntradaPedido {
  codigoErp: string;
  servicos: ServicoPedido[];
  mesInicial: string;
  qtdMeses: number;
  diaVencimento: number | null;
  responsavel: { id: number; nome: string } | null;
  observacoes: string;
}

export function validarEntrada(e: EntradaPedido): string | null {
  if (!/^\d+-\d+$/.test((e.codigoErp ?? "").trim())) return "Informe o código ERP da empresa no formato 1467-1.";
  if (!Array.isArray(e.servicos) || !e.servicos.length) return "Escolha pelo menos um serviço.";
  if (e.servicos.length > 15) return "No máximo 15 serviços por pedido.";
  if (!/^\d{4}-\d{2}$/.test(e.mesInicial ?? "")) return "Informe o mês inicial.";
  if (![1, 2, 3].includes(Number(e.qtdMeses))) return "Quantidade de meses deve ser 1, 2 ou 3.";
  if (e.diaVencimento != null && !(e.diaVencimento >= 1 && e.diaVencimento <= 31)) return "Dia de vencimento deve ser de 1 a 31.";
  return null;
}

export async function salvarPedido(ticketId: string, e: EntradaPedido, autor: string): Promise<PedidoTarefaDp> {
  const reg = await ler();
  const atual = reg[ticketId];
  if (atual && atual.resultados.some((r) => r.ok && !r.simulacao)) throw new Error("Este pedido já gerou tarefas no Tareffa; não dá para alterar.");
  const emp = await buscarEmpresaErp(e.codigoErp).catch(() => null);
  const p: PedidoTarefaDp = {
    ticketId,
    codigoErp: e.codigoErp.trim(),
    empresaNome: emp?.razaoSocial ?? null,
    tareffaEmpresaId: emp?.id ?? null,
    servicos: e.servicos.map((s) => ({ id: Number(s.id), nome: String(s.nome) })),
    mesInicial: e.mesInicial,
    qtdMeses: Number(e.qtdMeses),
    diaVencimento: e.diaVencimento ? Number(e.diaVencimento) : null,
    responsavel: e.responsavel ? { id: Number(e.responsavel.id), nome: String(e.responsavel.nome) } : null,
    observacoes: (e.observacoes ?? "").slice(0, 2000),
    criadoPor: autor,
    criadoEm: atual?.criadoEm ?? new Date().toISOString(),
    status: "pendente",
    resultados: [],
  };
  reg[ticketId] = p;
  await salvar(reg);
  return p;
}

/** Executa (ou simula) o pedido. Pula o que já foi gerado com sucesso. */
// Fluxo igual ao da tela do Tareffa (sem avulso):
//  1) vincula cada serviço à empresa:   GET  /services/empresas/{id}/servicos/adicionar/{servicoId}
//  2) gera a programação normal:        POST {PROG}/api/servico/programado/programacaoV3
//     (por ano, com os meses marcados, só para o código ERP da empresa). A geração é assíncrona:
//     o Tareffa responde "Gerando programação para os serviços!" e cria em seguida, com o
//     responsável e as datas das regras do próprio serviço.
const PROG = "https://prd-api-servico-programado.ottimizza.dev";
const DEPARTAMENTO_DP = Number(process.env.TAREFFA_DEPARTAMENTO_DP_ID ?? 19910);
const NOMES_MES = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export async function executarPedido(ticketId: string, simular: boolean, quem: string): Promise<PedidoTarefaDp> {
  const reg = await ler();
  const p = reg[ticketId];
  if (!p) throw new Error("Pedido não encontrado.");

  const emp = await buscarEmpresaErp(p.codigoErp);
  const agora = new Date().toISOString();
  const novos: ItemResultado[] = [];
  const lista = meses(p.mesInicial, p.qtdMeses);
  const rotuloMeses = lista.map((m) => `${pad(m.mes)}/${m.ano}`).join(", ");
  const jaFeito = (sid: number) => p.resultados.some((r) => r.ok && !r.simulacao && r.servicoId === sid && r.mes === rotuloMeses);

  for (const s of p.servicos) {
    const base = { servicoId: s.id, servico: s.nome, mes: rotuloMeses, simulacao: simular, em: agora, programacaoId: null };
    if (jaFeito(s.id)) continue;
    if (!emp) { novos.push({ ...base, ok: false, mensagem: `Empresa ${p.codigoErp} não encontrada no Tareffa.` }); continue; }
    if (simular) {
      // DIAGNÓSTICO (temporário): formato das regras de característica do serviço.
      try {
        const rg = await chamar(`https://prd-api-tareffa-spring-full.ottimizza.dev/api/regra_caracteristicas/servicos/${s.id}?page_size=999&page_index=0`);
        console.log("[tarefa-dp] regras", s.id, JSON.stringify(rg).slice(0, 3000));
      } catch (e) { console.log("[tarefa-dp] regras erro", s.id, String(e)); }
      try {
        const cl = await chamar(`/classificacoes/p/999/page/0/f`, { method: "POST", body: JSON.stringify({}) });
        console.log("[tarefa-dp] classificacoes", JSON.stringify(cl).slice(0, 3000));
      } catch (e) { console.log("[tarefa-dp] classificacoes erro", String(e)); }
      try {
        const ce = await chamar(`/classificacoes/519881/empresa/${emp.id}/caracteristicas`);
        console.log("[tarefa-dp] carac-empresa", JSON.stringify(ce).slice(0, 2000));
      } catch (e) { console.log("[tarefa-dp] carac-empresa erro", String(e)); }
      const aviso = emp.situacao != null && emp.situacao !== 1 ? " · ATENÇÃO: empresa não ativa" : "";
      novos.push({ ...base, ok: true, mensagem: `Vincularia o serviço a ${emp.razaoSocial} e geraria a programação de ${rotuloMeses}${aviso}.` });
      continue;
    }

    // 1) vínculo (se já estiver vinculado, o Tareffa recusa ou ignora — segue para a geração).
    let avisoVinculo = "";
    try {
      await chamar(`/empresas/${emp.id}/servicos/adicionar/${s.id}`);
    } catch (e) {
      avisoVinculo = ` (vínculo: ${e instanceof Error ? e.message.slice(0, 150) : String(e)})`;
    }

    // 2) geração, um pedido por ano.
    const porAno = new Map<number, number[]>();
    for (const m of lista) porAno.set(m.ano, [...(porAno.get(m.ano) ?? []), m.mes]);
    const msgs: string[] = [];
    let ok = true;
    for (const [ano, ms] of porAno) {
      const corpo: Record<string, unknown> = {
        gerarPara: 1, apagarNaoIniciados: false, programadoParaAno: ano,
        gerarParaEmpresasPorCodigoERP: [p.codigoErp], servicosId: [s.id],
        departamentoId: DEPARTAMENTO_DP, unidadeNegocio: null, caracteristicaId: null,
      };
      NOMES_MES.forEach((n, i) => { corpo[`programadoPara${n}`] = ms.includes(i + 1); });
      try {
        const j = (await chamar(`${PROG}/api/servico/programado/programacaoV3`, { method: "POST", body: JSON.stringify(corpo) })) as { status?: string; message?: string };
        const sucesso = String(j.status ?? "").toLowerCase() === "success";
        ok = ok && sucesso;
        msgs.push(sucesso ? `${j.message ?? "Gerando"} (${ms.map(pad).join(",")}/${ano})` : `Tareffa recusou: ${j.message ?? "sem detalhe"}`);
      } catch (e) {
        ok = false;
        msgs.push(e instanceof Error ? e.message : String(e));
      }
    }
    novos.push({ ...base, ok, mensagem: msgs.join(" · ") + avisoVinculo + (ok ? " — confira no Tareffa em alguns minutos." : "") });
  }

  p.resultados = [...p.resultados.filter((r) => !r.simulacao), ...novos];
  if (!simular) {
    const okCount = new Set(p.resultados.filter((r) => !r.simulacao && r.ok).map((r) => r.servicoId)).size;
    p.status = okCount >= p.servicos.length ? "concluido" : "com_erro";
  }
  if (emp) { p.empresaNome = emp.razaoSocial; p.tareffaEmpresaId = emp.id; }
  void quem;
  reg[ticketId] = p;
  await salvar(reg);
  return p;
}
