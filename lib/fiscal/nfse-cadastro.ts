// Fiscal › Notas Fiscais: empresas cadastradas para emissão (serviço, descrição
// padrão, grupo a que pertencem) e os tomadores de cada uma — SERVIDOR.
import { db, dig } from "@/lib/nfse/procuracao";
import { NacionalError } from "@/lib/nfse/nacional";

export interface TomadorCad { id: number; codigoempresa: number; doc: string | null; nome: string | null; padrao: boolean }
export interface EmpresaCad {
  codigoempresa: number; nome: string; cnpj: string; regime: string | null;
  grupo_codigo: number | null; grupo_nome: string | null;
  c_trib_nac: string | null; c_trib_mun: string | null; c_nbs: string | null;
  descricao_padrao: string | null; info_compl_padrao: string | null; ativo: boolean;
  tomadores: TomadorCad[];
}

export async function listarCadastro(): Promise<EmpresaCad[]> {
  const sb = db();
  const [e, t] = await Promise.all([
    sb.from("fiscal_nfse_empresas").select("*").order("nome"),
    sb.from("fiscal_nfse_tomadores").select("id,codigoempresa,doc,nome,padrao").order("nome"),
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
  const grupo = c.grupo_codigo ? Number(c.grupo_codigo) : null;
  if (grupo === cod) throw new NacionalError("A empresa não pode pertencer a ela mesma.");
  const agora = new Date().toISOString();
  const { data: ja } = await db().from("fiscal_nfse_empresas").select("codigoempresa").eq("codigoempresa", cod).maybeSingle();
  const linha = {
    codigoempresa: cod, nome: String(c.nome).trim(), cnpj: dig(c.cnpj), regime: c.regime ?? null,
    grupo_codigo: grupo, grupo_nome: grupo ? String(c.grupo_nome ?? "").trim() || null : null,
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

export async function salvarTomador(t: { codigoempresa: number; doc?: string | null; nome?: string | null; padrao?: boolean }, email: string) {
  const doc = dig(t.doc);
  if (doc && ![11, 14].includes(doc.length)) throw new NacionalError("Tomador: CPF (11) ou CNPJ (14 números).");
  if (doc.length === 11 && !String(t.nome ?? "").trim()) throw new NacionalError("Informe o nome do tomador (CPF).");
  if (!doc && !String(t.nome ?? "").trim()) throw new NacionalError("Informe o documento ou o nome do tomador.");
  const sb = db();
  if (t.padrao) await sb.from("fiscal_nfse_tomadores").update({ padrao: false }).eq("codigoempresa", t.codigoempresa);
  const { error } = await sb.from("fiscal_nfse_tomadores").insert({
    codigoempresa: t.codigoempresa, doc: doc || null, nome: String(t.nome ?? "").trim() || null, padrao: !!t.padrao, criado_por: email,
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
