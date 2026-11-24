// Recálculos — regras puras (sem rede, sem banco). Rodam nos testes.
//
// 1) extrairDebitos: lê os débitos exigíveis do bloco "Pendência - Débito (SIEF)"
//    do relatório da Situação Fiscal (texto do PDF).
// 2) servicoDoDebito: decide por onde a guia atualizada sai no Integra Contador:
//      Simples Nacional -> PGDASD GERARDAS12 (DAS)
//      DAS do MEI       -> PGMEI GERARDASPDF21
//      CP-* (previdenciária, vem da DCTFWeb) -> DCTFWEB GERARGUIA31
//      demais códigos   -> SICALC CONSOLIDARGERARDARF51 (DARF)
// 3) montagem dos "dados" de cada serviço.

export type Servico = "das" | "das_mei" | "dctfweb" | "sicalc" | "sem_guia";

export interface Debito {
  receita: string;            // "8109-02 - PIS" ou "SIMPLES NAC."
  codigo: string | null;      // "8109"
  extensao: string | null;    // "02"
  periodo: string;            // como no relatório: "MM/AAAA", "4º TRIM/2025", "AAAA" ou "DD/MM/AAAA"
  tipo_periodo: "ME" | "TR" | "AN" | "DI";
  vencimento: string;         // AAAA-MM-DD
  valor_original: number;
  saldo_devedor: number;
  multa: number;
  juros: number;
  saldo_consolidado: number;
  situacao: string | null;
  servico: Servico;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
const isoDeBr = (d: string) => { const [dd, mm, aa] = d.split("/"); return `${aa}-${mm}-${dd}`; };

export function servicoDoDebito(receita: string): Servico {
  const r = semAcento(receita).toUpperCase();
  if (/\bMAED\b|MULTA/.test(r)) return "sem_guia"; // multa lançada: guia própria da notificação
  if (/\bMEI\b|SIMEI/.test(r)) return "das_mei";
  if (/SIMPLES\s*NAC/.test(r)) return "das";
  if (/\bCP[-\s]/.test(r)) return "dctfweb";
  return "sicalc";
}

// Linha de débito: receita, PA, vencimento e 5 valores (orig, saldo, multa, juros, consolidado).
const VAL = "(\\d{1,3}(?:\\.\\d{3})*,\\d{2})";
const RE_LINHA = new RegExp(
  "((?:\\d{4}-\\d{2}\\s*-\\s*[A-Z][A-Z0-9 .\\-/]*?)|SIMPLES\\s+NAC\\.?(?:\\s*-\\s*MEI)?|DAS[- ]MEI)\\s+"
  + "(\\d{2}\\/\\d{2}\\/\\d{4}|\\d{2}\\/\\d{4}|\\d\\s*[ºo°]?\\s*TRIM\\/\\d{4}|\\d{4})\\s+(\\d{2}\\/\\d{2}\\/\\d{4})\\s+"
  + `${VAL}\\s+${VAL}\\s+${VAL}\\s+${VAL}\\s+${VAL}`
  + "(?:\\s+(?:Situa[cç][aã]o:\\s*)?([A-Z][A-Z \\-]{2,60}?))?(?=\\s+(?:\\d{4}-\\d{2}\\s*-|SIMPLES|DAS|P[aá]gina|Pend|D[eé]bito|Parcelamento|Inscri|Omiss|Processo|Notifica|_{3,}|$))",
  "g",
);

/** Débitos exigíveis do SIEF (o que pode virar guia nova). Ignora o que tem exigibilidade suspensa. */
export function extrairDebitos(txt: string): Debito[] {
  const out: Debito[] = [];
  const re = /Pend[eê]ncia\s*[-–]?\s*D[eé]bito\s*\(SIEF\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt)) !== null) {
    const resto = txt.slice(m.index + m[0].length);
    const fim = resto.search(/Pend[eê]ncia\s*[-–]?\s*(?!D[eé]bito\s*\(SIEF)|com\s+Exigibilidade\s+Suspensa|Diagn[oó]stico\s+Fiscal\s+na\s+Procuradoria/i);
    const bloco = (fim >= 0 ? resto.slice(0, fim) : resto.slice(0, 20000)).replace(/\s+/g, " ");
    const rl = new RegExp(RE_LINHA.source, RE_LINHA.flags);
    let l: RegExpExecArray | null;
    while ((l = rl.exec(bloco)) !== null) {
      const receita = l[1].trim().replace(/\s+/g, " ");
      const cod = /^(\d{4})-(\d{2})/.exec(receita);
      out.push({
        receita,
        codigo: cod?.[1] ?? null,
        extensao: cod?.[2] ?? null,
        periodo: l[2],
        tipo_periodo: /TRIM/i.test(l[2]) ? "TR" : /^\d{2}\/\d{2}\//.test(l[2]) ? "DI" : /^\d{4}$/.test(l[2]) ? "AN" : "ME",
        vencimento: isoDeBr(l[3]),
        valor_original: num(l[4]),
        saldo_devedor: num(l[5]),
        multa: num(l[6]),
        juros: num(l[7]),
        saldo_consolidado: num(l[8]),
        situacao: l[9]?.trim() || null,
        servico: servicoDoDebito(receita),
      });
    }
  }
  return out;
}

/** "MM/AAAA" ou "AAAA-MM" -> "AAAAMM". */
export function aaaamm(periodo: string): string {
  const a = /^(\d{2})\/(\d{4})$/.exec(periodo);
  if (a) return `${a[2]}${a[1]}`;
  const b = /^(\d{4})-(\d{2})$/.exec(periodo);
  if (b) return `${b[1]}${b[2]}`;
  const t = /^(\d)\s*[ºo°]?\s*TRIM\/(\d{4})$/i.exec(periodo); // trimestre -> último mês
  if (t) return `${t[2]}${String(Number(t[1]) * 3).padStart(2, "0")}`;
  throw new Error("Período inválido (use MM/AAAA).");
}

/** AAAA-MM-DD -> AAAAMMDD */
export const aaaammdd = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("Data de pagamento inválida.");
  return iso.replace(/-/g, "");
};

export interface PedidoRecalculo {
  servico: Servico;
  periodo: string;          // MM/AAAA (ou "4º TRIM/2025" no SICALC)
  dataPagamento: string;    // AAAA-MM-DD
  // SICALC
  codigo?: string;
  extensao?: string;
  vencimento?: string;      // AAAA-MM-DD
  valor?: number;
  observacao?: string;
}

/** Monta idSistema/idServico/versão/método e o "dados" de cada serviço. */
export function montarPedido(p: PedidoRecalculo, hoje: string) {
  if (p.dataPagamento < hoje) throw new Error("A data de pagamento não pode ser anterior a hoje.");
  const pa = aaaamm(p.periodo);
  // PGDASD/PGMEI: dataConsolidacao só aceita data FUTURA (MSG_ISN_002 se for hoje);
  // para pagar hoje vai sem o campo e a Receita consolida na data atual.
  const consolidacao = p.dataPagamento > hoje ? { dataConsolidacao: aaaammdd(p.dataPagamento) } : {};
  switch (p.servico) {
    case "das":
      return { idSistema: "PGDASD", idServico: "GERARDAS12", versaoSistema: "1.0",
        dados: { periodoApuracao: pa, ...consolidacao } };
    case "das_mei":
      return { idSistema: "PGMEI", idServico: "GERARDASPDF21", versaoSistema: "1.0",
        dados: { periodoApuracao: pa, ...consolidacao } };
    case "dctfweb":
      if (p.dataPagamento.slice(0, 7) !== hoje.slice(0, 7)) throw new Error("Na DCTFWeb a data de pagamento precisa ser no mês corrente.");
      return { idSistema: "DCTFWEB", idServico: "GERARGUIA31", versaoSistema: "1.0",
        dados: { categoria: "GERAL_MENSAL", anoPA: pa.slice(0, 4), mesPA: pa.slice(4), DataAcolhimentoProposta: Number(aaaammdd(p.dataPagamento)) } };
    case "sem_guia":
      throw new Error("Multa lançada (MAED): a guia sai pela notificação de lançamento no e-CAC.");
    case "sicalc": {
      const codigo = (p.codigo ?? "").replace(/\D/g, "");
      const extensao = (p.extensao ?? "").replace(/\D/g, "");
      if (codigo.length !== 4) throw new Error("Código de receita inválido (4 dígitos).");
      if (extensao.length !== 2) throw new Error("Extensão do código inválida (2 dígitos).");
      if (!p.vencimento || !/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento)) throw new Error("Informe o vencimento original.");
      if (!(p.valor && p.valor > 0)) throw new Error("Informe o valor principal.");
      const [mm, aaaa] = [pa.slice(4), pa.slice(0, 4)];
      const trimestral = /TRIM/i.test(p.periodo);
      const dados: Record<string, unknown> = {
        codigoReceita: codigo, codigoReceitaExtensao: extensao, tipoPA: trimestral ? "TR" : "ME", dataPA: `${mm}/${aaaa}`,
        vencimento: `${p.vencimento}T00:00:00`, valorImposto: p.valor.toFixed(2),
        dataConsolidacao: `${p.dataPagamento}T00:00:00`,
      };
      if (p.observacao?.trim()) dados.observacao = p.observacao.trim().slice(0, 100);
      return { idSistema: "SICALC", idServico: "CONSOLIDARGERARDARF51", versaoSistema: "2.9", dados };
    }
  }
}

/** PDF do retorno, conforme o serviço. */
export function pdfDoRetorno(servico: Servico, dados: unknown): string | null {
  const d = Array.isArray(dados) ? dados[0] : dados;
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const v = servico === "sicalc" ? o.darf : servico === "dctfweb" ? o.PDFByteArrayBase64 : o.pdf;
  return typeof v === "string" && v.length > 100 ? v : (typeof o.pdf === "string" ? o.pdf : null);
}

export const ROTULO_SERVICO: Record<Servico, string> = {
  das: "DAS (Simples)", das_mei: "DAS-MEI", dctfweb: "DCTFWeb", sicalc: "DARF (SICALC)", sem_guia: "Sem guia aqui",
};
