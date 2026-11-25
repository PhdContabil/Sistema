// NFS-e do MEI direto pela API do Portal Nacional (Sefin), no lugar do robô
// que preenchia o Emissor Nacional no Chrome — SERVIDOR.
//
// Autenticação e assinatura com o certificado A1 da PHD (o mesmo do Financeiro,
// tabela nfse_empresas, empresa 725). O prestador da DPS é o MEI: a PHD emite
// "representando" o MEI pela procuração eletrônica que ele deu à PHD no Emissor
// Nacional (regra da Receita de 23/11/2026 — dispensa o certificado do cliente).
//
// O número da DPS é controlado aqui, por CNPJ do MEI (tabela mei_nfse). O número
// da NFS-e quem dá é a Sefin; ele volta na resposta e vai para o lançamento no Questor.
import { ibgePorCep, NacionalError } from "@/lib/nfse/nacional";
import type { ConfigNacional, NotaNac, TomadorNac } from "@/lib/nfse/nacional-formato";
import { listaMEI, AVULSO_SALAO } from "@/lib/mei/questor-mei";
import { db, dig, hojeBR, tomadorPorCnpj, tomadorDigitado, emitirPorProcuracao, pdfPorChave, SERIE_DPS, type RespostaProcuracao } from "@/lib/nfse/procuracao";

const DISCRIMINACAO_PADRAO = "NOTA PELO PRESTADOR. Serviços prestados de beleza, conforme resolução CGSN nº 140 de 22 de maio de 2018, cota parte profissional parceiro.";

/** Códigos de tributação nacional (LC 116, item + subitem + desdobro) usados pelos MEI de salão. */
export const SERVICOS_MEI: { cTribNac: string; descricao: string }[] = [
  { cTribNac: "060101", descricao: "06.01.01 — Barbearia, cabeleireiros, manicuros, pedicuros e congêneres" },
  { cTribNac: "060201", descricao: "06.02.01 — Esteticistas, tratamento de pele, depilação e congêneres" },
  { cTribNac: "060301", descricao: "06.03.01 — Banhos, duchas, sauna, massagens e congêneres" },
];

export const ambienteMei = (): 1 | 2 => (process.env.MEI_NFSE_AMBIENTE === "homologacao" ? 2 : 1);

/**
 * Código nacional a partir da atividade municipal do Questor ("00601 - Barbearia…",
 * "00000601 - …", "8516 - Estética…"). Sem certeza, devolve "" e a tela pede para escolher.
 */
export function cTribNacDaAtividade(ativ: string): string {
  const [cod, ...resto] = String(ativ ?? "").split(" - ");
  const desc = resto.join(" ").toLowerCase();
  const n = dig(cod).replace(/^0+/, "");
  if (/^60[1-3]$/.test(n)) return `0${n}01`;
  if (/barb|cabele|manicur|pedicur|unha|sobrancel|maqui/.test(desc)) return "060101";
  if (/est[eé]tic|pele|depila/.test(desc)) return "060201";
  if (/massag|sauna|ducha|banho/.test(desc)) return "060301";
  return "";
}

export interface PedidoNotaMei {
  cod: number;
  data: string;            // competência AAAA-MM-DD
  valor: number;
  descricao?: string;
  cTribNac?: string;
  tomadorModo: "salao" | "sem" | "outro";
  tomadorDoc?: string | null;
  tomadorNome?: string | null;
  idem: string;            // chave única do clique (evita nota em dobro)
  simular?: boolean;       // monta e assina, não envia
}

export type RespostaNotaMei = RespostaProcuracao;

/** Monta tudo o que a DPS precisa a partir do cadastro do MEI no Questor. */
async function montar(p: PedidoNotaMei) {
  const m = (await listaMEI()).find((x) => x.cod === Number(p.cod));
  if (!m) throw new NacionalError(`MEI ${p.cod} não encontrado.`);
  if (m.bloqueado) throw new NacionalError("Empresa BLOQUEADA: emissão desabilitada.");
  const cnpj = dig(m.cnpj);
  if (cnpj.length !== 14) throw new NacionalError("CNPJ do MEI inválido no cadastro.");
  if (m.fim && p.data > String(m.fim).slice(0, 10) && String(m.fim).slice(0, 4) < "2100") throw new NacionalError(`Profissional baixado em ${String(m.fim).slice(0, 10).split("-").reverse().join("/")}: a nota só pode ter data até a baixa.`);
  const ibge = (await ibgePorCep(m.cep)) ?? "";
  if (ibge.length !== 7) throw new NacionalError(`Não achei o município (IBGE) pelo CEP do MEI (${m.cep || "vazio"}). Confira o CEP no cadastro.`);
  const cTribNac = dig(p.cTribNac) || cTribNacDaAtividade(m.ativMunic);
  if (cTribNac.length !== 6) throw new NacionalError("Escolha o serviço (código de tributação nacional).");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.data)) throw new NacionalError("Data inválida.");
  if (p.data > hojeBR()) throw new NacionalError("A data da nota não pode ser futura.");
  const valor = Math.round(Number(p.valor) * 100) / 100;
  if (!(valor > 0)) throw new NacionalError("Valor inválido.");

  let tomador: TomadorNac | null = null;
  if (p.tomadorModo === "salao") {
    const doc = dig(m.salaoCnpj);
    if (m.salaoCod === AVULSO_SALAO || /^5+$/.test(doc) || !doc) tomador = null; // avulso: consumidor não identificado
    else if (doc.length === 14) tomador = await tomadorPorCnpj(doc, m.salao);
    else throw new NacionalError("CNPJ do salão inválido no cadastro — escolha \"Outro\" ou \"Sem tomador\".");
  } else if (p.tomadorModo === "outro") {
    tomador = await tomadorDigitado(p.tomadorDoc, p.tomadorNome);
    if (!tomador) throw new NacionalError("Tomador: CPF (11 números) ou CNPJ (14 números).");
  }
  if (tomador && dig(tomador.cpf_cnpj) === cnpj) throw new NacionalError("Tomador igual ao prestador.");

  const cfg: ConfigNacional = {
    ambiente: ambienteMei(), cnpj, im: "", cLocEmi: ibge, serie: SERIE_DPS, cTribNac, cNBS: "",
    opSimpNac: 2, pTotTribSN: 0, verAplic: "NucleoMEI1",
  };
  const nota: Omit<NotaNac, "nDPS"> = {
    dCompet: p.data, valor, descricao: String(p.descricao ?? "").trim() || DISCRIMINACAO_PADRAO, infoCompl: "",
    tomador: tomador ?? ({} as TomadorNac),
  };
  return { m, cnpj, cfg, nota, tomador };
}

export async function emitirNotaMei(p: PedidoNotaMei, email: string): Promise<RespostaNotaMei> {
  let base: Awaited<ReturnType<typeof montar>>;
  try { base = await montar(p); }
  catch (e) { return { ok: false, erro: e instanceof Error ? e.message : "Falha ao preparar a nota." }; }
  return emitirPorProcuracao({
    origem: "mei", codigoempresa: base.m.cod, nome: base.m.razao, cfg: base.cfg, nota: base.nota, tomador: base.tomador,
    idem: p.idem, email, simular: p.simular,
  });
}

/** Notas emitidas pelo Núcleo para um MEI (mais recentes primeiro). */
export async function notasEmitidasMei(cod: number) {
  const { data } = await db().from("mei_nfse").select("id,dcompet,valor,nnfse,chave_acesso,status,tomador_nome,emitido_por,criado_em,ambiente")
    .eq("codigoempresa", cod).in("status", ["emitida", "incerta"]).order("criado_em", { ascending: false }).limit(20);
  return data ?? [];
}

/** PDF da nota (DANFSe). */
export const pdfNotaMei = pdfPorChave;
