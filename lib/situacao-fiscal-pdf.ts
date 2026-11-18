// Situação Fiscal — leitura e classificação do PDF do SITFIS. Puro (sem rede,
// sem banco): roda nos testes e no "Reclassificar", que não custa nada.
//
// A API devolve só o PDF; a situação sai do texto do "Diagnóstico Fiscal".
// Regra (REGRA_VERSAO 5, a mesma do phd-empresas):
//   - débito exigível (Débito, Inscrição/SIDA, Omissão, parcelamento com
//     parcela em atraso)                             -> irregular
//   - só exigibilidade suspensa (parcelamento em dia, "com Exigibilidade
//     Suspensa", processo)                           -> com_restricao
//   - nenhum bloco                                   -> regular
// Suba REGRA_VERSAO ao mudar a regra: o Reclassificar reprocessa só o que
// estiver em versão diferente.

import zlib from "node:zlib";

export const REGRA_VERSAO = 6; // 6: também grava os débitos do SIEF (Recálculos)

export type Situacao = "regular" | "com_restricao" | "irregular" | "indefinida" | "erro";

export interface Periodo { inclusao: string; exclusao: string | null }

export interface Classificacao {
  situacao: Situacao;
  pendencias: number | null;
  resumo: string;
  simples_opcao?: boolean;
  simples_inclusao?: string | null;
  simples_exclusao?: string | null;
  simples_periodos?: Periodo[] | null;
  simei_opcao?: boolean;
  simei_inclusao?: string | null;
  simei_exclusao?: string | null;
  certidao_tipo?: string | null;
  certidao_validade?: string | null;
}

/** Texto do PDF: descompacta os streams FlateDecode e junta o que está entre parênteses. */
export function textoDoPdf(pdfBase64: string): string {
  const buf = Buffer.from(pdfBase64, "base64");
  let saida = "";
  let i = 0;
  for (;;) {
    const ini = buf.indexOf("stream", i);
    if (ini < 0) break;
    let p = ini + 6;
    if (buf[p] === 0x0d) p++;
    if (buf[p] === 0x0a) p++;
    const fim = buf.indexOf("endstream", p);
    if (fim < 0) break;
    const bruto = buf.subarray(p, fim);
    let conteudo: Buffer | null = null;
    try { conteudo = zlib.inflateSync(bruto); } catch {
      try { conteudo = zlib.inflateRawSync(bruto); } catch { conteudo = null; }
    }
    if (conteudo) saida += conteudo.toString("latin1");
    i = fim + 9;
  }
  if (!saida) saida = buf.toString("latin1");

  const partes: string[] = [];
  const re = /\((?:\\.|[^\\()])*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(saida)) !== null) {
    partes.push(m[0].slice(1, -1)
      .replace(/\\(\d{3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)))
      .replace(/\\([()\\])/g, "$1"));
  }
  return partes.join(" ").replace(/\s+/g, " ").trim();
}

export const semAcento = (s: string | null | undefined) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const dataBr = (s: string) => {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

const hojeIso = () => new Date().toISOString().slice(0, 10);

// Recorta a janela no próximo "Opção pelo…": o bloco do SIMEI vem logo depois
// do Simples e, sem o corte, a data do MEI era lida como se fosse do Simples.
function periodosDaOpcao(txt: string, rotulo: string): Periodo[] | null {
  const i = semAcento(txt).indexOf(semAcento(rotulo));
  if (i < 0) return null;
  const depois = txt.slice(i + rotulo.length);
  const corte = depois.search(/Op[cç][aã]o pelo|S[oó]cios|Certid[aã]o|Diagn[oó]stico|Estabelecimento|Dados Cadastrais/i);
  const janela = corte > 0 ? depois.slice(0, corte) : depois.slice(0, 400);
  const datas = (janela.match(/\d{2}\/\d{2}\/\d{4}/g) ?? []).map(dataBr).filter((d): d is string => !!d);
  const periodos: Periodo[] = [];
  for (let k = 0; k < datas.length; k += 2) periodos.push({ inclusao: datas[k], exclusao: datas[k + 1] ?? null });
  return periodos;
}

// Vale o período mais recente. Exclusão futura = saída agendada (ainda optante).
function resumoDaOpcao(periodos: Periodo[] | null, hoje: string) {
  if (!periodos) return { opcao: false, inclusao: null, exclusao: null, periodos: null };
  if (!periodos.length) return { opcao: true, inclusao: null, exclusao: null, periodos: null };
  const atual = periodos[periodos.length - 1];
  return {
    opcao: !atual.exclusao || atual.exclusao >= hoje,
    inclusao: atual.inclusao,
    exclusao: atual.exclusao,
    periodos: periodos.length > 1 ? periodos : null,
  };
}

export function extrairSimplesNacional(txt: string, hoje = hojeIso()) {
  const sn = resumoDaOpcao(periodosDaOpcao(txt, "Opção pelo Simples Nacional"), hoje);
  const mei = resumoDaOpcao(periodosDaOpcao(txt, "Opção pelo SIMEI"), hoje);
  return {
    simples_opcao: sn.opcao, simples_inclusao: sn.inclusao,
    simples_exclusao: sn.exclusao, simples_periodos: sn.periodos,
    simei_opcao: mei.opcao, simei_inclusao: mei.inclusao, simei_exclusao: mei.exclusao,
  };
}

export function extrairCertidao(txt: string) {
  const i = semAcento(txt).indexOf("certidao emitida");
  if (i < 0) return { certidao_tipo: null, certidao_validade: null };
  const janela = txt.slice(i, i + 400);
  const tipo = /positiva com efeitos de negativa/i.test(janela) ? "Positiva com efeitos de negativa"
    : /negativa/i.test(janela) ? "Negativa"
    : /positiva/i.test(janela) ? "Positiva" : null;
  const m = janela.match(/validade[^0-9]{0,20}(\d{2}\/\d{2}\/\d{4})/i);
  return { certidao_tipo: tipo, certidao_validade: m ? dataBr(m[1]) : null };
}

type Classe = "exigivel" | "suspenso";
export interface Bloco { classe: Classe; rotulo: string }

// Dois padrões de título, sempre com o sistema entre parênteses no fim:
//   "Pendência - Débito (SIEF)"                        -> exigível
//   "Parcelamento com Exigibilidade Suspensa (PARCSN)" -> suspenso
// Exigir o "(SISTEMA)" evita casar com texto corrido ("Não foram detectadas
// pendências/exigibilidades suspensas").
const RE_BLOCO = /(Pend[eê]ncia\s*[-–]?\s*)?(D[eé]bito|Parcelamento|Inscri[cç][aã]o|Omiss[aã]o|Processo)(\s+com\s+Exigibilidade\s+Suspensa)?\s*\(([A-Za-z0-9/ .-]{2,24})\)/gi;

const ROTULO: Record<string, string> = {
  debito: "débito",
  parcelamento: "parcelamento",
  inscricao: "inscrição em dívida ativa",
  omissao: "omissão de declaração",
  processo: "processo fiscal",
};

export function blocosDePendencia(txt: string): Bloco[] {
  const diag = txt.search(/Diagn[oó]stico Fiscal/i);
  const base = diag >= 0 ? txt.slice(diag) : txt;

  const marcas: { ini: number; tipo: string; suspensa: boolean; sistema: string }[] = [];
  const re = new RegExp(RE_BLOCO.source, RE_BLOCO.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(base)) !== null) {
    const [, prefPend, tipo, suspensa, sistema] = m;
    if (!prefPend && !suspensa) continue; // não é cabeçalho de bloco
    marcas.push({ ini: m.index, tipo: semAcento(tipo), suspensa: !!suspensa, sistema });
  }

  return marcas.map((mk, idx): Bloco => {
    const fim = idx + 1 < marcas.length ? marcas[idx + 1].ini : mk.ini + 1200;
    const corpo = semAcento(base.slice(mk.ini, fim));
    const rot = ROTULO[mk.tipo] ?? mk.tipo;
    if (mk.suspensa) return { classe: "suspenso", rotulo: `${rot} com exigibilidade suspensa (${mk.sistema})` };
    if (mk.tipo === "parcelamento") {
      const atraso = Number(corpo.match(/parcelas? em atraso\s*(\d+)/)?.[1] ?? 0);
      return atraso > 0
        ? { classe: "exigivel", rotulo: `parcelamento com ${atraso} parcela(s) em atraso` }
        : { classe: "suspenso", rotulo: "parcelamento em dia" };
    }
    return { classe: "exigivel", rotulo: rot };
  });
}

export function classificarTexto(txt: string, hoje = hojeIso()): Classificacao {
  const t = semAcento(txt);
  if (t.length < 40) return { situacao: "indefinida", pendencias: null, resumo: "Não foi possível ler o texto do relatório." };

  const extras = { ...extrairSimplesNacional(txt, hoje), ...extrairCertidao(txt) };
  const semPendencia = /nao (constam|existem|ha|foram|foi) [^.]{0,40}pendenc/.test(t)
    || /nao foram detectadas pendenc/.test(t)
    || /nenhuma pendencia/.test(t) || /nao possui pendencias/.test(t);

  const blocos = blocosDePendencia(txt);
  const exigiveis = blocos.filter((b) => b.classe === "exigivel");
  const suspensos = blocos.filter((b) => b.classe === "suspenso");
  const rotulos = (arr: Bloco[]) => [...new Set(arr.map((b) => b.rotulo))].join(", ");

  if (!blocos.length) {
    return semPendencia
      ? { situacao: "regular", pendencias: 0, resumo: "Não foram detectadas pendências nem exigibilidades suspensas.", ...extras }
      : { situacao: "indefinida", pendencias: null, resumo: "Não identifiquei blocos de pendência no relatório. Confira o PDF.", ...extras };
  }
  if (exigiveis.length) {
    return {
      situacao: "irregular", pendencias: blocos.length,
      resumo: `Débito exigível: ${rotulos(exigiveis)}${suspensos.length ? `. Também há ${rotulos(suspensos)}.` : "."}`,
      ...extras,
    };
  }
  return {
    situacao: "com_restricao", pendencias: blocos.length,
    resumo: `Somente pendência com exigibilidade suspensa: ${rotulos(suspensos)}.`, ...extras,
  };
}

export function classificarRelatorio(pdfBase64: string, hoje = hojeIso()): Classificacao {
  let txt = "";
  try { txt = textoDoPdf(pdfBase64); } catch { txt = ""; }
  return classificarTexto(txt, hoje);
}
