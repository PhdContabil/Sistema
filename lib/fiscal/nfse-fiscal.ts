// Fiscal › Notas Fiscais: NFS-e de clientes do Simples Nacional (ME/EPP) pela API
// do Portal Nacional, com o certificado da PHD + procuração do cliente — SERVIDOR.
// Mesmo núcleo da emissão do MEI (lib/nfse/procuracao.ts). Primeira versão:
// só Simples (regApTribSN 1 — ISS dentro do DAS), sem retenções.
import { ibgePorCep, NacionalError } from "@/lib/nfse/nacional";
import type { ConfigNacional, NotaNac } from "@/lib/nfse/nacional-formato";
import { q } from "@/lib/mei/questor-mei";
import { chamar } from "@/lib/mei/api";
import { db, dig, hojeBR, tomadorDigitado, emitirPorProcuracao, SERIE_DPS, type RespostaProcuracao } from "@/lib/nfse/procuracao";

export const ambienteFiscal = (): 1 | 2 => (process.env.FISCAL_NFSE_AMBIENTE === "homologacao" ? 2 : 1);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export interface EmpresaFiscal {
  codigoempresa: number; nome: string; cnpj: string; im: string; municipio: string; uf: string; cep: string;
  regime: string; ativa: boolean; ativMunic: string; cTribNacSugerido: string;
  simples: { ok: boolean; aliquota: number | null; competencia: string | null; motivo?: string };
}

/** Código nacional a partir da atividade municipal ("00601", "0601", "17.19"…): item + subitem + desdobro 01. */
export function cTribNacDaAtividadeMunic(cod: string): string {
  const n = dig(cod).replace(/^0+/, "");
  if (n.length === 3 || n.length === 4) return n.padStart(4, "0") + "01";
  return "";
}

export interface EmpresaLista { codigoempresa: number; nome: string; cnpj: string; regime: string; municipio: string; uf: string }
let cacheLista: { t: number; v: EmpresaLista[] } | null = null;

/** Empresas ativas do Questor (matriz), por código — para a lista da tela. Cache de 10 min. */
export async function listarEmpresasFiscal(): Promise<EmpresaLista[]> {
  if (cacheLista && Date.now() - cacheLista.t < 600_000) return cacheLista.v;
  const r = await q("/empresas/cadastro", { apenas_ativas: "true" });
  if (r.status !== 200) throw new NacionalError(`Questor ${r.status} ao listar as empresas.`);
  const vistos = new Set<number>();
  const v: EmpresaLista[] = [];
  for (const e of (r.json.dados ?? []) as Json[]) {
    if (vistos.has(e.codigoempresa) || !(e.matriz || e.codigoestab === 1)) continue;
    vistos.add(e.codigoempresa);
    v.push({ codigoempresa: e.codigoempresa, nome: e.nomeestab || e.nomeempresa || "", cnpj: dig(e.inscrfederal), regime: String(e.regime ?? ""), municipio: e.nomemunic || "", uf: e.siglaestado || "" });
  }
  v.sort((a, b) => a.codigoempresa - b.codigoempresa);
  cacheLista = { t: Date.now(), v };
  return v;
}

/** Cadastro + situação no Simples (alíquota efetiva = % aproximado dos tributos na DPS). */
export async function obterEmpresaFiscal(cod: number, competencia?: string): Promise<EmpresaFiscal> {
  const [c, s] = await Promise.all([
    q("/empresas/cadastro", { codigoempresa: cod, detalhado: "true" }),
    q(`/fiscal/simples/aliquotas/${cod}`),
  ]);
  if (c.status !== 200) throw new NacionalError(`Questor ${c.status} ao ler a empresa.`);
  const L: Json[] = c.json.dados ?? [];
  const e: Json = L.find((x) => x.matriz || x.codigoestab === 1) ?? L[0];
  if (!e) throw new NacionalError(`Empresa ${cod} não encontrada no Questor.`);
  const regime = String(e.regime ?? "");
  let simples: EmpresaFiscal["simples"] = { ok: false, aliquota: null, competencia: null, motivo: "Empresa fora do Simples Nacional (ou sem apuração no Questor)." };
  if (/\bMEI\b|MICRO\s*EMPREENDEDOR/i.test(regime)) simples.motivo = "Empresa MEI: emita pelo Sistema MEI.";
  else if (s.status === 200) {
    const comp = (competencia ?? hojeBR()).slice(0, 7);
    const per = [s.json.atual, s.json.proximo].find((x: Json) => x?.competencia === comp) ?? s.json.atual ?? s.json.proximo;
    const aliq = Number(per?.aliq_efetiva);
    simples = aliq > 0 && aliq < 100
      ? { ok: true, aliquota: Math.round(aliq * 100) / 100, competencia: per.competencia }
      : { ok: false, aliquota: null, competencia: per?.competencia ?? null, motivo: "Sem alíquota efetiva do Simples no Questor para a competência." };
  }
  return {
    codigoempresa: e.codigoempresa, nome: e.nomeestab || e.nomeempresa || "", cnpj: dig(e.inscrfederal), im: dig(e.inscrmunic),
    municipio: e.nomemunic || "", uf: e.siglaestado || "", cep: dig(e.cependerestab), regime, ativa: !!e.ativa,
    ativMunic: [e.codigoativmunic, e.descrativmunestab].filter(Boolean).join(" - "),
    cTribNacSugerido: cTribNacDaAtividadeMunic(e.codigoativmunic ?? ""), simples,
  };
}

export interface PedidoNotaFiscal {
  codigoempresa: number;
  data: string;
  valor: number;
  descricao: string;
  infoCompl?: string;
  cTribNac: string;
  cTribMun?: string;
  tomadorDoc?: string | null;
  tomadorNome?: string | null;
  idem: string;
  simular?: boolean;
}

export async function emitirNotaFiscal(p: PedidoNotaFiscal, email: string): Promise<RespostaProcuracao> {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.data)) throw new NacionalError("Data inválida.");
    if (p.data > hojeBR()) throw new NacionalError("A data da nota não pode ser futura.");
    const valor = Math.round(Number(p.valor) * 100) / 100;
    if (!(valor > 0)) throw new NacionalError("Valor inválido.");
    if (!String(p.descricao ?? "").trim()) throw new NacionalError("Descreva o serviço.");
    const cTribNac = dig(p.cTribNac);
    if (cTribNac.length !== 6) throw new NacionalError("Código de tributação nacional: 6 dígitos (item + subitem + desdobro, ex.: 170101).");
    const cTribMun = dig(p.cTribMun);
    if (cTribMun && cTribMun.length !== 3) throw new NacionalError("Código de tributação municipal: 3 dígitos.");

    const emp = await obterEmpresaFiscal(Number(p.codigoempresa), p.data);
    if (!emp.ativa) throw new NacionalError("Empresa inativa no Questor.");
    if (!emp.simples.ok) throw new NacionalError(emp.simples.motivo ?? "Só Simples Nacional por enquanto.");
    if (emp.cnpj.length !== 14) throw new NacionalError("CNPJ da empresa inválido no Questor.");
    const ibge = (await ibgePorCep(emp.cep)) ?? "";
    if (ibge.length !== 7) throw new NacionalError(`Não achei o município (IBGE) pelo CEP da empresa (${emp.cep || "vazio"}).`);
    const tomador = await tomadorDigitado(p.tomadorDoc, p.tomadorNome);

    const cfg: ConfigNacional = {
      ambiente: ambienteFiscal(), cnpj: emp.cnpj, im: emp.im.slice(0, 15), cLocEmi: ibge, serie: SERIE_DPS,
      cTribNac, cTribMun: cTribMun && cTribMun !== "000" ? cTribMun : undefined, cNBS: "",
      opSimpNac: 3, pTotTribSN: emp.simples.aliquota ?? 0, verAplic: "NucleoFiscal1",
    };
    const nota: Omit<NotaNac, "nDPS"> = { dCompet: p.data, valor, descricao: p.descricao.trim(), infoCompl: String(p.infoCompl ?? "").trim(), tomador: tomador ?? ({} as NotaNac["tomador"]) };
    return await emitirPorProcuracao({ origem: "fiscal", codigoempresa: emp.codigoempresa, nome: emp.nome, cfg, nota, tomador, idem: p.idem, email, simular: p.simular });
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao preparar a nota." };
  }
}

/** Notas emitidas pelo Fiscal (por empresa, ou as últimas de todas). */
export async function notasEmitidasFiscal(cod?: number) {
  let qy = db().from("mei_nfse").select("id,codigoempresa,cnpj,dcompet,valor,nnfse,chave_acesso,status,tomador_doc,tomador_nome,emitido_por,criado_em,ambiente,questor_ok,questor_erro")
    .eq("origem", "fiscal").in("status", ["emitida", "incerta"]).order("criado_em", { ascending: false }).limit(50);
  if (cod) qy = qy.eq("codigoempresa", cod);
  const { data } = await qy;
  return data ?? [];
}

/**
 * Lança no Questor a NFS-e emitida (saída na empresa). Rota da API: POST /fiscal/nfse-saida
 * (a /fiscal/nota-servico é só do MEI). Enquanto a rota não existir, devolve o aviso.
 */
export async function lancarNoQuestor(id: number, email: string): Promise<{ ok: boolean; mensagem: string; dados?: unknown }> {
  const sb = db();
  const { data: n } = await sb.from("mei_nfse").select("*").eq("id", id).eq("origem", "fiscal").maybeSingle();
  if (!n || n.status !== "emitida") return { ok: false, mensagem: "Nota não encontrada ou não emitida." };
  if (n.questor_ok) return { ok: true, mensagem: "Esta nota já foi lançada no Questor." };
  const r = await chamar("POST", "/fiscal/nfse-saida", {
    corpo: {
      codigoempresa: n.codigoempresa, data: n.dcompet, valor: Number(n.valor), numeronf: Number(n.nnfse), chave_acesso: n.chave_acesso,
      tomador_doc: n.tomador_doc, tomador_nome: n.tomador_nome, ctribnac: n.ctribnac, descricao: n.descricao,
    },
    idempotencia: `fiscal-nfse-${n.chave_acesso}`, usuario: email, liberar: true,
  });
  if (r.status === 404 && /not found|não encontrad/i.test(JSON.stringify(r.json))) {
    const msg = "A API do Questor ainda não tem a rota de lançamento (/fiscal/nfse-saida). A nota foi emitida; lance manualmente ou aguarde a rota.";
    await sb.from("mei_nfse").update({ questor_erro: msg }).eq("id", id);
    return { ok: false, mensagem: msg };
  }
  const j = r.json as { detail?: unknown; erro?: string; dry_run?: boolean } | null;
  if (r.status >= 300) {
    const msg = typeof j?.detail === "string" ? j.detail : j?.erro ?? JSON.stringify(j).slice(0, 300);
    await sb.from("mei_nfse").update({ questor_erro: msg }).eq("id", id);
    return { ok: false, mensagem: `Questor ${r.status}: ${msg}` };
  }
  if (j?.dry_run) return { ok: false, mensagem: "A API respondeu em simulação (dry_run): nada foi gravado.", dados: j };
  await sb.from("mei_nfse").update({ questor_ok: true, questor_erro: null, atualizado_em: new Date().toISOString() }).eq("id", id);
  return { ok: true, mensagem: "Nota lançada no Questor.", dados: j };
}
