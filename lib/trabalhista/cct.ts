// Trabalhista › Convenções Coletivas — sindicatos e pesquisas programadas no Mediador (MTE). SERVIDOR.
// A pesquisa em si acontece no Chrome de quem usa (robô local preenche, a pessoa clica em
// "Pesquisar" por causa do reCAPTCHA do Mediador). Aqui fica o cadastro, a agenda e o histórico.
import { createClient } from "@supabase/supabase-js";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Banco indisponível.");
  return createClient(url, key, { auth: { persistSession: false } });
}
const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
export const TIPOS_INSTRUMENTO: Record<string, string> = {
  convencao: "Convenção Coletiva",
  acordo: "Acordo Coletivo",
  termoAditivoConvecao: "Termo Aditivo de Convenção",
  termoAditivoAcordo: "Termo Aditivo de Acordo",
};

export interface Sindicato { id: number; nome: string; cnpj: string | null; uf: string | null; observacao: string | null; ativo: boolean; criado_por: string | null; criado_em: string }
export interface Pesquisa {
  id: number; sindicato_id: number; tipos: string[]; vigencia: string | null; uf: string | null; agendada_para: string | null;
  repetir_dias: number | null; status: string; resultado: string | null; tentativas: number; criado_por: string | null; criado_em: string;
  feita_por: string | null; feita_em: string | null;
}

export async function listar() {
  const sb = db();
  const [s, p] = await Promise.all([
    sb.from("trab_sindicatos").select("*").order("nome"),
    sb.from("trab_cct_pesquisas").select("*").order("agendada_para", { ascending: true, nullsFirst: false }).limit(500),
  ]);
  if (s.error) throw new Error(s.error.message);
  if (p.error) throw new Error(p.error.message);
  return { sindicatos: (s.data ?? []) as Sindicato[], pesquisas: (p.data ?? []) as Pesquisa[], hoje: hojeBR() };
}

export async function salvarSindicato(d: Partial<Sindicato>, email: string) {
  const nome = String(d.nome ?? "").trim();
  const cnpj = dig(d.cnpj);
  if (!nome) throw new Error("Informe o nome do sindicato.");
  if (cnpj && cnpj.length !== 14) throw new Error("CNPJ do sindicato: 14 números (ou deixe em branco).");
  const campos = { nome: nome.slice(0, 200), cnpj: cnpj || null, uf: String(d.uf ?? "").trim().toUpperCase().slice(0, 2) || null, observacao: String(d.observacao ?? "").trim() || null, ativo: d.ativo ?? true, atualizado_em: new Date().toISOString() };
  const sb = db();
  const r = d.id
    ? await sb.from("trab_sindicatos").update(campos).eq("id", d.id).select("*").single()
    : await sb.from("trab_sindicatos").insert({ ...campos, criado_por: email }).select("*").single();
  if (r.error) throw new Error(/duplicate|unique/i.test(r.error.message) ? "Já existe um sindicato com esse CNPJ." : r.error.message);
  return r.data as Sindicato;
}

export async function excluirSindicato(id: number) {
  const { error } = await db().from("trab_sindicatos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function salvarPesquisa(d: Partial<Pesquisa>, email: string) {
  if (!d.sindicato_id) throw new Error("Escolha o sindicato.");
  const tipos = (d.tipos ?? []).filter((t) => t in TIPOS_INSTRUMENTO);
  if (!tipos.length) throw new Error("Escolha ao menos um tipo (convenção, acordo ou aditivo).");
  const data = String(d.agendada_para ?? "") || hojeBR();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error("Data da pesquisa inválida.");
  const rep = d.repetir_dias == null || String(d.repetir_dias) === "" ? null : Number(d.repetir_dias);
  if (rep !== null && !(rep >= 1 && rep <= 90)) throw new Error("Repetir a cada 1 a 90 dias.");
  const campos = { sindicato_id: d.sindicato_id, tipos, vigencia: d.vigencia ?? "", uf: String(d.uf ?? "").toUpperCase().slice(0, 2) || null, agendada_para: data, repetir_dias: rep };
  const sb = db();
  const r = d.id
    ? await sb.from("trab_cct_pesquisas").update(campos).eq("id", d.id).select("*").single()
    : await sb.from("trab_cct_pesquisas").insert({ ...campos, status: "pendente", criado_por: email }).select("*").single();
  if (r.error) throw new Error(r.error.message);
  return r.data as Pesquisa;
}

/**
 * Resultado de uma tentativa: "encontrada" encerra; "nao_encontrada" com repetição agenda a próxima
 * tentativa (hoje + N dias) e continua pendente.
 */
export async function registrarResultado(id: number, resultado: "encontrada" | "nao_encontrada" | "cancelada", obs: string, email: string) {
  const sb = db();
  const { data: p } = await sb.from("trab_cct_pesquisas").select("*").eq("id", id).maybeSingle();
  if (!p) throw new Error("Pesquisa não encontrada.");
  const agora = new Date().toISOString();
  const campos: Record<string, unknown> = { feita_por: email, feita_em: agora, tentativas: (p.tentativas ?? 0) + (resultado === "cancelada" ? 0 : 1), resultado: obs.trim() || p.resultado };
  if (resultado === "nao_encontrada" && p.repetir_dias) {
    const prox = new Date(Date.parse(hojeBR() + "T12:00:00Z") + p.repetir_dias * 864e5).toISOString().slice(0, 10);
    Object.assign(campos, { status: "pendente", agendada_para: prox });
  } else campos.status = resultado;
  const { error } = await sb.from("trab_cct_pesquisas").update(campos).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function excluirPesquisa(id: number) {
  const { error } = await db().from("trab_cct_pesquisas").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
