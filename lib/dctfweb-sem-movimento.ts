// Fiscal · DCTFWeb sem movimento. SERVIDOR.
// 1) apurar (grátis): compara M-1 × M na tabela dctfweb (débitos do Questor)
// 2) R-2099 na EFD-Reinf (certificado da PHD) -> consultar protocolo
// 3) DCTFWeb da competência pelo Integra (pago, reaproveita transmitir())
// 4) empresa fica "sem movimento desde M" até o movimento voltar.

import { db, registrarChamada } from "./serpro/servidor";
import { consultar, obterParametros, sincronizarObrigadas, transmitir, validarCompetencia } from "./dctfweb";
import { consultarR2099, enviarR2099 } from "./reinf";
import { apurar, competenciaAnterior, raiz, type AmbienteReinf, type LinhaMov } from "./reinf-regras";

export interface LinhaSemMov {
  id: number; cnpj: string; raiz: string; razao_social: string | null; codigoempresa: number | null;
  competencia: string; debito_anterior: number | null; situacao: string; ambiente: number | null;
  protocolo: string | null; recibo_r2099: string | null; erro: string | null; ativa: boolean;
  encerrada_em: string | null; dctfweb_id: number | null; por: string | null; updated_at: string;
}

const T = "dctfweb_sem_movimento";

async function linhasDctf(competencia: string): Promise<LinhaMov[]> {
  const { data, error } = await db().from("dctfweb").select("cnpj, razao_social, codigoempresa, debito").eq("competencia", competencia).limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []) as LinhaMov[];
}

async function uma(id: number): Promise<LinhaSemMov> {
  const { data, error } = await db().from(T).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Registro não encontrado.");
  return data as LinhaSemMov;
}

async function gravar(id: number, campos: Record<string, unknown>) {
  const { error } = await db().from(T).update({ ...campos, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function ambienteAtual(): Promise<AmbienteReinf> {
  const p = (await obterParametros()) as { ambiente_reinf?: number };
  return p.ambiente_reinf === 1 ? 1 : 2;
}

export async function definirAmbiente(ambiente: number, por: string) {
  if (ambiente !== 1 && ambiente !== 2) throw new Error("Ambiente inválido.");
  const { error } = await db().from("dctfweb_parametros").update({ ambiente_reinf: ambiente, updated_by: por, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) throw new Error(error.message);
}

/** Tela: registros da competência + todas as empresas que seguem sem movimento. */
export async function listarSemMovimento(competencia: string) {
  validarCompetencia(competencia);
  const { data, error } = await db().from(T).select("*").or(`competencia.eq.${competencia},ativa.eq.true`).order("razao_social");
  if (error) throw new Error(error.message);
  const contagem = async (c: string) => (await db().from("dctfweb").select("id", { count: "exact", head: true }).eq("competencia", c)).count ?? 0;
  const [nAtual, nAnterior] = await Promise.all([contagem(competencia), contagem(competenciaAnterior(competencia))]);
  return { linhas: (data ?? []) as LinhaSemMov[], ambiente: await ambienteAtual(), sincronizadas: { atual: nAtual, anterior: nAnterior } };
}

/**
 * Aponta (grátis): sincroniza M-1 e M do Questor, grava as candidatas como
 * "apontada" e encerra as que voltaram a ter movimento.
 */
export async function apontar(competencia: string, por: string) {
  validarCompetencia(competencia);
  const anterior = competenciaAnterior(competencia);
  await sincronizarObrigadas(anterior);
  await sincronizarObrigadas(competencia);
  const { data: ativas, error } = await db().from(T).select("id, raiz, competencia").eq("ativa", true);
  if (error) throw new Error(error.message);
  // marcadas nesta mesma competência também não são candidatas de novo
  const { data: daComp } = await db().from(T).select("raiz").eq("competencia", competencia);
  const jaMarcadas = new Set([...(ativas ?? []), ...(daComp ?? [])].map((a) => a.raiz as string));
  const atual = await linhasDctf(competencia);
  const { candidatos, voltaram } = apurar(await linhasDctf(anterior), atual, jaMarcadas);

  // Apontadas desta competência (nada enviado ainda) que agora têm movimento no
  // Questor: o apontamento foi feito antes do fechamento e deixa de valer.
  const comMov = new Set(atual.filter((l) => Number(l.debito) > 0).map((l) => raiz(l.cnpj)));
  const { data: apontadas } = await db().from(T).select("id, raiz").eq("competencia", competencia).eq("situacao", "apontada").is("protocolo", null);
  const descartar = (apontadas ?? []).filter((a) => comMov.has(a.raiz as string)).map((a) => a.id as number);
  if (descartar.length) {
    const { error: eD } = await db().from(T).delete().in("id", descartar);
    if (eD) throw new Error(eD.message);
  }

  if (candidatos.length) {
    const { error: e } = await db().from(T).upsert(candidatos.map((c) => ({
      cnpj: c.cnpj.replace(/\D/g, ""), raiz: raiz(c.cnpj), razao_social: c.razao_social, codigoempresa: c.codigoempresa,
      competencia, debito_anterior: c.debito_anterior, situacao: "apontada", por,
    })), { onConflict: "raiz,competencia", ignoreDuplicates: true });
    if (e) throw new Error(e.message);
  }
  // só as ativas de competências anteriores podem "voltar"
  const encerrar = (ativas ?? []).filter((a) => voltaram.includes(a.raiz as string) && (a.competencia as string) < competencia).map((a) => a.id as number);
  if (encerrar.length) {
    await db().from(T).update({ ativa: false, encerrada_em: competencia, updated_at: new Date().toISOString() }).in("id", encerrar);
  }
  return { apontadas: candidatos.length, voltaram: encerrar.length, descartadas: descartar.length };
}

/** Envia o R-2099 sem movimento (irreversível em produção). */
export async function enviar(id: number, por: string) {
  const l = await uma(id);
  if (["r2099_enviado", "r2099_aceito", "concluida"].includes(l.situacao)) return { ok: true, pulou: true, motivo: "R-2099 já enviado." };
  const ambiente = await ambienteAtual();
  try {
    const r = await enviarR2099(l.cnpj, l.competencia, ambiente);
    await gravar(id, { situacao: "r2099_enviado", ambiente, id_evento: r.id, protocolo: r.protocolo, erro: null, por });
    await registrarChamada("reinf-r2099", `R-2099 sem movimento ${l.competencia}`, l.cnpj, true, { protocolo: r.protocolo, ambiente, por });
    return { ok: true, protocolo: r.protocolo };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await gravar(id, { situacao: "r2099_erro", ambiente, erro: msg.slice(0, 500), por });
    await registrarChamada("reinf-r2099", `R-2099 sem movimento ${l.competencia}`, l.cnpj, false, { erro: msg.slice(0, 300), ambiente, por });
    return { ok: false, mensagem: msg };
  }
}

/** Confere o protocolo do R-2099 (grátis). */
export async function conferir(id: number) {
  const l = await uma(id);
  if (!l.protocolo) return { ok: false, mensagem: "Ainda não enviado." };
  const r = await consultarR2099(l.protocolo, (l.ambiente === 1 ? 1 : 2));
  if (r.estado === "aceito") await gravar(id, { situacao: "r2099_aceito", recibo_r2099: r.recibo, erro: null });
  else if (r.estado === "rejeitado") await gravar(id, { situacao: "r2099_erro", erro: r.mensagem.slice(0, 500) });
  return { ok: true, ...r };
}

/**
 * Transmite a DCTFWeb sem movimento pelo Integra (pago, irreversível).
 * Só depois do R-2099 aceito em PRODUÇÃO. Cria a linha na tabela dctfweb se faltar.
 */
export async function transmitirDctf(id: number, por: string) {
  const l = await uma(id);
  if (l.situacao !== "r2099_aceito") return { ok: false, mensagem: "Antes, o R-2099 precisa estar aceito." };
  if (l.ambiente !== 1) return { ok: false, mensagem: "R-2099 enviado em produção restrita (teste): não gera DCTFWeb real." };
  const { data: existente } = await db().from("dctfweb").select("id").eq("cnpj", l.cnpj).eq("competencia", l.competencia).maybeSingle();
  let dctfId = existente?.id as number | undefined;
  if (!dctfId) {
    const { data, error } = await db().from("dctfweb").insert({
      cnpj: l.cnpj, competencia: l.competencia, razao_social: l.razao_social, codigoempresa: l.codigoempresa, debito: 0, obrigada: true,
    }).select("id").single();
    if (error) throw new Error(error.message);
    dctfId = data.id as number;
  }
  const r = await transmitir(dctfId, { por, semMovimento: true });
  if (r.ok) await gravar(id, { situacao: "concluida", dctfweb_id: dctfId, erro: null });
  else await gravar(id, { dctfweb_id: dctfId, erro: ("mensagem" in r ? String(r.mensagem) : String(r.motivo ?? "Falha")).slice(0, 500) });
  return r;
}

/** Tira da fila sem enviar (ex.: a empresa teve movimento que o Questor não mostrou). */
export async function dispensar(id: number, por: string) {
  await gravar(id, { situacao: "dispensada", ativa: false, por });
  return { ok: true };
}

/**
 * Consulta na DCTFWeb (Integra, pago) se a declaração da competência já foi
 * entregue. Se sim, o registro sem movimento vira "concluida" (Entregue).
 */
export async function consultarDctf(id: number) {
  const l = await uma(id);
  const { data: existente } = await db().from("dctfweb").select("id").eq("cnpj", l.cnpj).eq("competencia", l.competencia).maybeSingle();
  let dctfId = existente?.id as number | undefined;
  if (!dctfId) {
    const { data, error } = await db().from("dctfweb").insert({
      cnpj: l.cnpj, competencia: l.competencia, razao_social: l.razao_social, codigoempresa: l.codigoempresa, debito: 0, obrigada: true,
    }).select("id").single();
    if (error) throw new Error(error.message);
    dctfId = data.id as number;
  }
  const r = await consultar(dctfId);
  if (r.ok && r.situacao === "transmitida") await gravar(id, { situacao: "concluida", dctfweb_id: dctfId, erro: null });
  else await gravar(id, { dctfweb_id: dctfId });
  return r;
}
