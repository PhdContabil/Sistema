// Cria "serviço programado avulso" no Tareffa a partir das atividades do processo societário
// (igual ao Tareffa Societário: atividade do tipo de processo com "Serviço" vinculado gera o serviço
// para a empresa). API do Tareffa principal, com o mesmo token já usado nos documentos.
import { tokenTareffa } from "@/lib/tareffa-documentos";
import { supabaseAdmin } from "./supabase";
import { listTipos } from "./tiposProcesso";
import { listarModelos } from "./tipoAtividades";
import type { UnifiedProcesso } from "./dataSource";

const API = "https://prd-api-oauth-tareffa.ottimizza.dev/services";
const BUCKET = "cache-nucleo";
const ARQ = "societario-tareffa-servicos.json";

async function H() {
  return { Authorization: `Bearer ${await tokenTareffa()}`, "Content-Type": "application/json" };
}
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

export interface ServicoTareffa { id: number; nome: string }

/** Serviços ativos do Tareffa (para o cadastro do tipo de processo). */
export async function listarServicosTareffa(): Promise<ServicoTareffa[]> {
  const out: ServicoTareffa[] = [];
  for (let page = 0; page < 10; page++) {
    const r = await fetch(`${API}/servicos?page_index=${page}&page_size=200&ativo=true`, { headers: await H(), cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { records?: { id: number; nome: string }[]; length?: number };
    const rec = j.records ?? [];
    out.push(...rec.map((x) => ({ id: x.id, nome: x.nome })));
    if (rec.length < 200 || out.length >= (j.length ?? 0)) break;
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Cliente do Tareffa pelo CNPJ/CPF (ou pelo nome, se não achar). */
async function acharCliente(doc: string, nome: string): Promise<{ id: number; nome: string } | null> {
  for (const descricao of [doc.replace(/\D/g, ""), nome].filter((x) => x && x.length >= 3)) {
    const r = await fetch(`${API}/empresas/f?page_size=10&page_index=0`, { method: "POST", headers: await H(), body: JSON.stringify({ descricao, isAtivo: false }), cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { records?: { id: number; razaoSocial: string; situacao?: number }[] };
    const rec = j.records ?? [];
    if (rec.length) {
      const ativo = rec.find((x) => x.situacao === 1) ?? rec[0];
      return { id: ativo.id, nome: ativo.razaoSocial };
    }
  }
  return null;
}

/** Usuário interno do Tareffa pelo nome do responsável do Núcleo (ex.: "RHAFAEL SANTOS"). */
async function acharUsuario(nome: string): Promise<{ id: number; nome: string } | null> {
  if (!nome) return null;
  const alvo = sem(nome);
  const primeiro = alvo.split(/\s+/)[0];
  const r = await fetch(`${API}/usuarios?page_index=0&page_size=50&nome=${encodeURIComponent(primeiro)}`, { headers: await H(), cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as { records?: { id: number; nome: string; tipoUsuario?: number }[] };
  const internos = (j.records ?? []).filter((u) => u.tipoUsuario === 1);
  const exato = internos.find((u) => sem(u.nome) === alvo);
  const parcial = internos.find((u) => alvo.split(/\s+/).every((p) => sem(u.nome).includes(p))) ?? internos.find((u) => sem(u.nome).startsWith(primeiro));
  const u = exato ?? parcial;
  return u ? { id: u.id, nome: u.nome } : null;
}

export interface ResultadoServico {
  atividade: string;
  servico: string;
  ok: boolean;
  msg: string;
  em: string;
}
type Registro = Record<string, ResultadoServico[]>; // chave = id do processo

async function lerRegistro(): Promise<Registro> {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(ARQ);
  if (error || !data) return {};
  try { return JSON.parse(await data.text()) as Registro; } catch { return {}; }
}
async function salvarRegistro(r: Registro) {
  await supabaseAdmin().storage.from(BUCKET).upload(ARQ, new Blob([JSON.stringify(r)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
}

export async function servicosDoProcesso(processoId: number): Promise<ResultadoServico[]> {
  return (await lerRegistro())[String(processoId)] ?? [];
}

/**
 * Cria no Tareffa os serviços das atividades do processo que têm "Serviço do Tareffa" no tipo de processo.
 * Não repete o que já foi criado com sucesso para o mesmo processo + atividade.
 */
export async function criarServicosNoTareffa(p: UnifiedProcesso): Promise<ResultadoServico[]> {
  const tipos = await listTipos();
  const tipo = tipos.find((t) => t.name === p.process);
  if (!tipo) return [];
  const modelo = (await listarModelos())[String(tipo.id)] ?? [];
  const comServico = modelo.filter((m) => m.servicoTareffa?.id);
  if (!comServico.length) return [];

  const reg = await lerRegistro();
  const feitos = reg[String(p.id)] ?? [];
  const resultados: ResultadoServico[] = [...feitos];
  const agora = new Date().toISOString();

  let cliente: { id: number; nome: string } | null = null;
  try { cliente = await acharCliente(p.inscription || "", p.name); } catch { cliente = null; }

  for (const m of comServico) {
    if (feitos.some((f) => f.ok && sem(f.atividade) === sem(m.nome))) continue;
    const servico = m.servicoTareffa!;
    const ativ = p.activities.find((a) => sem(a.name) === sem(m.nome));
    const base = { atividade: m.nome, servico: servico.nome, em: agora };
    if (!cliente) {
      resultados.push({ ...base, ok: false, msg: "Empresa não encontrada no Tareffa (pelo CNPJ/CPF nem pelo nome)." });
      continue;
    }
    const respNome = m.responsavelTareffa || ativ?.responsible || p.bearer || "";
    const usuario = await acharUsuario(respNome).catch(() => null);
    if (!usuario) {
      resultados.push({ ...base, ok: false, msg: `Responsável "${respNome || "(vazio)"}" não encontrado entre os usuários do Tareffa.` });
      continue;
    }
    const venc = (ativ?.deadline_in || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const [y, mm] = venc.split("-");
    const obs = [ativ?.obs, `Criado pelo Núcleo · processo societário #${p.id} (${p.process})`].filter(Boolean).join("\n");
    try {
      const r = await fetch(`${API}/servicos_programados/avulso`, {
        method: "POST",
        headers: await H(),
        cache: "no-store",
        body: JSON.stringify({
          servico: { id: servico.id },
          cliente: { id: cliente.id },
          alocadoPara: { id: usuario.id },
          dataVencimento: `${venc}T23:00:00.000Z`,
          observacoes: obs,
          referencia: `Societário #${p.id}`,
          tipoGeracao: 2,
          retificacao: false,
          competencia: `${mm}/${y}`,
          nrOcorrencias: 1,
          tempoUnitario: 0,
          valorUnitario: 0,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { message?: string; status?: string };
      const ok = r.ok && String(j.status ?? "").toLowerCase() !== "error";
      resultados.push({ ...base, ok, msg: ok ? `Criado para ${usuario.nome} em ${cliente.nome}, vencimento ${venc.split("-").reverse().join("/")}.` : `Tareffa recusou (HTTP ${r.status}): ${j.message ?? "sem detalhe"}` });
    } catch (e) {
      resultados.push({ ...base, ok: false, msg: `Falha ao chamar o Tareffa: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  // Mantém só a tentativa mais recente por atividade.
  const porAtiv = new Map<string, ResultadoServico>();
  for (const r of resultados) porAtiv.set(sem(r.atividade), r);
  reg[String(p.id)] = [...porAtiv.values()];
  await salvarRegistro(reg);
  return reg[String(p.id)];
}
