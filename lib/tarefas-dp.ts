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

// ------------------------------------------------------------------ Tareffa

async function chamar(path: string, init: RequestInit = {}, tentou401 = false): Promise<unknown> {
  const r = await fetch(`${API}${path}`, {
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
  if (!e.responsavel?.id) return "Escolha o responsável no Tareffa.";
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
export async function executarPedido(ticketId: string, simular: boolean, quem: string): Promise<PedidoTarefaDp> {
  const reg = await ler();
  const p = reg[ticketId];
  if (!p) throw new Error("Pedido não encontrado.");

  const emp = await buscarEmpresaErp(p.codigoErp);
  const agora = new Date().toISOString();
  const novos: ItemResultado[] = [];
  const jaFeito = (sid: number, mes: string) => p.resultados.some((r) => r.ok && !r.simulacao && r.servicoId === sid && r.mes === mes);

  for (const s of p.servicos) {
    for (const m of meses(p.mesInicial, p.qtdMeses)) {
      const mes = `${pad(m.mes)}/${m.ano}`;
      const base = { servicoId: s.id, servico: s.nome, mes, simulacao: simular, em: agora };
      if (jaFeito(s.id, mes)) continue;
      if (!emp) { novos.push({ ...base, ok: false, programacaoId: null, mensagem: `Empresa ${p.codigoErp} não encontrada no Tareffa.` }); continue; }

      const corpo: Record<string, unknown> = {
        servico: { id: s.id },
        cliente: { id: emp.id },
        ...(p.responsavel ? { alocadoPara: { id: p.responsavel.id } } : {}),
        observacoes: [p.observacoes, `Criado pelo Núcleo · ticket #${ticketId} · aprovado por ${quem}`].filter(Boolean).join("\n"),
        referencia: `Ticket #${ticketId}`,
        tipoGeracao: 2,
        retificacao: false,
        nrOcorrencias: 1,
        tempoUnitario: 0,
        valorUnitario: 0,
      };
      let descricao: string;
      // Igual à tela "+ Avulso" do Tareffa: manda competência E dataVencimento (sem dia fixo, a data de hoje).
      corpo.competencia = `${pad(m.mes)}/${m.ano}`;
      if (p.diaVencimento) {
        const d = Math.min(p.diaVencimento, ultimoDia(m.ano, m.mes));
        corpo.dataVencimento = `${m.ano}-${pad(m.mes)}-${pad(d)}T12:00:00.000Z`;
        descricao = `competência ${pad(m.mes)}/${m.ano}, vencimento ${pad(d)}/${pad(m.mes)}/${m.ano}`;
      } else {
        corpo.dataVencimento = new Date().toISOString();
        descricao = `competência ${pad(m.mes)}/${m.ano}`;
      }

      if (simular) {
        const aviso = emp.situacao != null && emp.situacao !== 1 ? ` · ATENÇÃO: empresa com situação ${emp.situacao} (não ativa)` : "";
        novos.push({ ...base, ok: true, programacaoId: null, mensagem: `Seria criada: ${s.nome} para ${emp.razaoSocial}, ${descricao}${aviso}.` });
        continue;
      }
      try {
        const j = (await chamar(`/servicos_programados/avulso`, { method: "POST", body: JSON.stringify(corpo) })) as { status?: string; message?: string };
        const msg = String(j.message ?? j.status ?? "");
        const ok = String(j.status ?? "").toLowerCase() === "success";
        const id = /ID:\s*(\d+)/i.exec(msg)?.[1];
        novos.push({ ...base, ok, programacaoId: id ? Number(id) : null, mensagem: ok ? `${msg || "Tareffa respondeu sem confirmação (resposta vazia) — NÃO confirmado, confira na tela"} (${descricao})` : `Tareffa recusou: ${msg || "sem detalhe"}` });
      } catch (e) {
        novos.push({ ...base, ok: false, programacaoId: null, mensagem: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  // Simulação não fica no histórico definitivo: troca as simulações anteriores pelas novas.
  p.resultados = [...p.resultados.filter((r) => !r.simulacao), ...novos];
  if (!simular) {
    const reais = p.resultados.filter((r) => !r.simulacao);
    const total = p.servicos.length * p.qtdMeses;
    const okCount = new Set(reais.filter((r) => r.ok).map((r) => `${r.servicoId}|${r.mes}`)).size;
    p.status = okCount >= total ? "concluido" : "com_erro";
  }
  if (emp) { p.empresaNome = emp.razaoSocial; p.tareffaEmpresaId = emp.id; }
  reg[ticketId] = p;
  await salvar(reg);
  return p;
}
