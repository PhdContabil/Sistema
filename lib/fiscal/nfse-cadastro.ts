// Fiscal › Notas Fiscais: empresas cadastradas para emissão (serviço, descrição
// padrão, grupo a que pertencem) e os tomadores de cada uma — SERVIDOR.
import { db, dig } from "@/lib/nfse/procuracao";
import { NacionalError } from "@/lib/nfse/nacional";

export interface TomadorCad { id: number; codigoempresa: number; doc: string | null; nome: string | null; padrao: boolean; descricao: string | null; info_compl: string | null }
export interface GrupoCad { id: number; nome: string }
export interface EmpresaCad {
  codigoempresa: number; nome: string; cnpj: string; regime: string | null;
  grupo_codigo: number | null; grupo_nome: string | null; grupo_id: number | null;
  c_trib_nac: string | null; c_trib_mun: string | null; c_nbs: string | null;
  descricao_padrao: string | null; info_compl_padrao: string | null; ativo: boolean;
  tomadores: TomadorCad[];
}

export async function listarCadastro(): Promise<EmpresaCad[]> {
  const sb = db();
  const [e, t] = await Promise.all([
    sb.from("fiscal_nfse_empresas").select("*").order("nome"),
    sb.from("fiscal_nfse_tomadores").select("id,codigoempresa,doc,nome,padrao,descricao,info_compl").order("nome"),
  ]);
  if (e.error) throw new Error(e.error.message);
  const tom = new Map<number, TomadorCad[]>();
  for (const x of (t.data ?? []) as TomadorCad[]) tom.set(x.codigoempresa, [...(tom.get(x.codigoempresa) ?? []), x]);
  return ((e.data ?? []) as EmpresaCad[]).map((x) => ({ ...x, tomadores: tom.get(x.codigoempresa) ?? [] }));
}

export type DadosCadastro = Partial<Omit<EmpresaCad, "tomadores" | "ativo">> & { codigoempresa: number; nome: string; cnpj: string };

export async function salvarCadastro(c: DadosCadastro, email: string) {
  const cod = Number(c.codigoempresa);
  if (!cod) throw new NacionalError("Escolha a empresa.");
  const nac = dig(c.c_trib_nac), mun = dig(c.c_trib_mun), nbs = dig(c.c_nbs);
  if (nac && nac.length !== 6) throw new NacionalError("Código nacional: 6 dígitos (ex.: 060101).");
  if (mun && mun.length !== 3) throw new NacionalError("Código municipal: 3 dígitos.");
  if (nbs && nbs.length !== 9) throw new NacionalError("NBS: 9 dígitos.");
  // "Pertence a" pode ser a própria empresa (ex.: o salão dentro do próprio grupo).
  const grupo = c.grupo_codigo ? Number(c.grupo_codigo) : null;
  const agora = new Date().toISOString();
  const { data: ja } = await db().from("fiscal_nfse_empresas").select("codigoempresa").eq("codigoempresa", cod).maybeSingle();
  const linha = {
    codigoempresa: cod, nome: String(c.nome).trim(), cnpj: dig(c.cnpj), regime: c.regime ?? null,
    grupo_codigo: grupo, grupo_nome: grupo ? String(c.grupo_nome ?? "").trim() || null : null,
    grupo_id: c.grupo_id ? Number(c.grupo_id) : null,
    c_trib_nac: nac || null, c_trib_mun: mun || null, c_nbs: nbs || null,
    descricao_padrao: String(c.descricao_padrao ?? "").trim() || null,
    info_compl_padrao: String(c.info_compl_padrao ?? "").trim() || null,
    atualizado_por: email, atualizado_em: agora, ...(ja ? {} : { criado_por: email, criado_em: agora }),
  };
  const { error } = await db().from("fiscal_nfse_empresas").upsert(linha, { onConflict: "codigoempresa" });
  if (error) throw new Error(error.message);
}

export async function removerCadastro(cod: number) {
  const { error } = await db().from("fiscal_nfse_empresas").delete().eq("codigoempresa", cod);
  if (error) throw new Error(error.message);
}

export async function salvarTomador(t: { codigoempresa: number; doc?: string | null; nome?: string | null; padrao?: boolean; sem_tomador?: boolean; descricao?: string | null; info_compl?: string | null }, email: string) {
  // "Sem tomador": nota para consumidor não identificado, com descrição própria.
  if (t.sem_tomador) t = { ...t, doc: null, nome: String(t.nome ?? "").trim() || "Sem tomador" };
  const doc = dig(t.doc);
  if (doc && ![11, 14].includes(doc.length)) throw new NacionalError("Tomador: CPF (11) ou CNPJ (14 números).");
  if (doc.length === 11 && !String(t.nome ?? "").trim()) throw new NacionalError("Informe o nome do tomador (CPF).");
  if (!doc && !String(t.nome ?? "").trim()) throw new NacionalError("Informe o documento ou o nome do tomador.");
  const sb = db();
  if (t.padrao) await sb.from("fiscal_nfse_tomadores").update({ padrao: false }).eq("codigoempresa", t.codigoempresa);
  const { error } = await sb.from("fiscal_nfse_tomadores").insert({
    codigoempresa: t.codigoempresa, doc: doc || null, nome: String(t.nome ?? "").trim() || null, padrao: !!t.padrao, criado_por: email,
    descricao: String(t.descricao ?? "").trim() || null, info_compl: String(t.info_compl ?? "").trim() || null,
  });
  if (error) throw new Error(/foreign/i.test(error.message) ? "Salve a empresa antes de cadastrar tomadores." : error.message);
}

export async function marcarTomadorPadrao(id: number) {
  const sb = db();
  const { data } = await sb.from("fiscal_nfse_tomadores").select("codigoempresa").eq("id", id).maybeSingle();
  if (!data) throw new NacionalError("Tomador não encontrado.");
  await sb.from("fiscal_nfse_tomadores").update({ padrao: false }).eq("codigoempresa", data.codigoempresa);
  await sb.from("fiscal_nfse_tomadores").update({ padrao: true }).eq("id", id);
}

export async function removerTomador(id: number) {
  const { error } = await db().from("fiscal_nfse_tomadores").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Descrição / informação complementar própria do tomador (vazias = usa o texto padrão da empresa). */
export async function textosTomador(id: number, descricao: string | null, info_compl: string | null) {
  const { error } = await db().from("fiscal_nfse_tomadores").update({
    descricao: String(descricao ?? "").trim() || null, info_compl: String(info_compl ?? "").trim() || null,
  }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Grupos com nome (ex.: "Grupo OBDE", "Dao e Novadao"): não precisam ser empresa cliente. */
export async function listarGrupos(): Promise<GrupoCad[]> {
  const { data, error } = await db().from("fiscal_nfse_grupos").select("id,nome").order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []) as GrupoCad[];
}

export async function criarGrupo(nome: string, email: string): Promise<GrupoCad> {
  const n = String(nome ?? "").trim().replace(/\s+/g, " ");
  if (!n) throw new NacionalError("Informe o nome do grupo.");
  const { data, error } = await db().from("fiscal_nfse_grupos").insert({ nome: n.slice(0, 120), criado_por: email }).select("id,nome").single();
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "Já existe um grupo com esse nome." : error.message);
  return data as GrupoCad;
}

export async function renomearGrupo(id: number, nome: string) {
  const n = String(nome ?? "").trim().replace(/\s+/g, " ");
  if (!n) throw new NacionalError("Informe o nome do grupo.");
  const { error } = await db().from("fiscal_nfse_grupos").update({ nome: n.slice(0, 120) }).eq("id", id);
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "Já existe um grupo com esse nome." : error.message);
}

/** Remove o grupo; as empresas dele ficam sem grupo (não são apagadas). */
export async function removerGrupo(id: number) {
  const { error } = await db().from("fiscal_nfse_grupos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
