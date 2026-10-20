// Conferência do CNPJ lido no documento contra o CNPJ da PRÓPRIA empresa no cadastro
// do Questor — lógica PURA (só importa ./cnpj), pra poder ser testada sem PDF, OCR,
// SharePoint nem Questor.
//
// O problema que isto resolve: um contrato social cita vários CNPJs (de sócias que
// são pessoas jurídicas, do sindicato, de uma empresa anterior, de uma filial…). O
// robô pegava o primeiro CNPJ VÁLIDO que achava e perguntava ao Zen "quem é esse
// cliente?". Se o CNPJ era de outra empresa e ela também é cliente do Zen, a empresa
// ficava PRONTA — e o envio iria para o cliente errado. Se não era cliente do Zen,
// aparecia "CLIENTE NÃO CADASTRADO", dando a entender que a empresa não está no Zen.
//
// A regra agora: o CNPJ que vale é o do cadastro da empresa no Questor (a mesma
// fonte do código da pasta). O documento só serve se CONFIRMAR esse CNPJ.

import { cnpjValido, formatarCnpj } from "./cnpj";

/** Só os dígitos do CNPJ, se forem exatamente 14; senão null. (Não confere o dígito verificador.) */
export function digitosDoCnpj(cnpj: string | null | undefined): string | null {
  const d = (cnpj ?? "").replace(/\D/g, "");
  return d.length === 14 ? d : null;
}

/** Algo que parece CNPJ, com ou sem pontuação (mesma forma que o leitor de certidão usa). */
const REGEX_CNPJ = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g;

/**
 * TODOS os CNPJs válidos (dígito verificador conferido) citados num texto, sem
 * repetir, formatados e na ordem em que aparecem. Quem decide qual deles é o da
 * empresa é `conferirCnpjComCadastro` — aqui só se coleta.
 */
export function cnpjsValidosDoTexto(texto: string): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const m of texto.matchAll(REGEX_CNPJ)) {
    const digitos = digitosDoCnpj(m[0]);
    if (!digitos || vistos.has(digitos)) continue;
    vistos.add(digitos);
    if (cnpjValido(digitos)) saida.push(formatarCnpj(digitos));
  }
  return saida;
}

/** O CNPJ do cadastro só serve de referência se tem 14 dígitos e passa na conferência. */
export function cnpjDeReferencia(cnpjDoCadastro: string | null | undefined): string | null {
  const digitos = digitosDoCnpj(cnpjDoCadastro);
  return digitos && cnpjValido(digitos) ? formatarCnpj(digitos) : null;
}

/** Mesmos 8 primeiros dígitos (a raiz) = mesma empresa, outro estabelecimento (matriz/filial). */
export function mesmaRaiz(a: string, b: string): boolean {
  const da = digitosDoCnpj(a);
  const db = digitosDoCnpj(b);
  return !!da && !!db && da.slice(0, 8) === db.slice(0, 8);
}

/** O que um documento mostrou, em CNPJs válidos (lista vazia = nenhum CNPJ válido nele). */
export interface CnpjsDoDocumento {
  arquivo: string;
  cnpjs: string[];
}

export type Conferencia =
  /** Algum documento cita o CNPJ do cadastro: é esse que vale. */
  | { tipo: "CONFERE"; cnpj: string; arquivo: string }
  /** Há CNPJs válidos nos documentos, mas nenhum é o do cadastro. */
  | { tipo: "DIFERENTE"; cadastro: string; lidos: { arquivo: string; cnpj: string; mesmaRaiz: boolean }[] }
  /** Não há CNPJ de referência (empresa fora do cadastro ou sem CNPJ válido lá): não dá pra comparar. */
  | { tipo: "SEM_REFERENCIA" }
  /** Há referência, mas nenhum documento trouxe um CNPJ válido. */
  | { tipo: "NENHUM_LIDO" };

/**
 * Compara o que os documentos citam com o CNPJ do cadastro. Igualdade EXATA dos 14
 * dígitos — filial/matriz com a mesma raiz NÃO confere (o cliente do Zen é por CNPJ
 * completo; mandar o documento pro CNPJ de outro estabelecimento seria chute), só é
 * sinalizado em `mesmaRaiz` pra quem for conferir.
 */
export function conferirCnpjComCadastro(
  documentos: CnpjsDoDocumento[],
  cnpjDoCadastro: string | null | undefined
): Conferencia {
  const referencia = cnpjDeReferencia(cnpjDoCadastro);
  if (!referencia) return { tipo: "SEM_REFERENCIA" };
  const alvo = digitosDoCnpj(referencia);

  const lidos: { arquivo: string; cnpj: string; mesmaRaiz: boolean }[] = [];
  for (const doc of documentos) {
    for (const cnpj of doc.cnpjs) {
      if (digitosDoCnpj(cnpj) === alvo) return { tipo: "CONFERE", cnpj: referencia, arquivo: doc.arquivo };
      lidos.push({ arquivo: doc.arquivo, cnpj, mesmaRaiz: mesmaRaiz(cnpj, referencia) });
    }
  }
  if (lidos.length === 0) return { tipo: "NENHUM_LIDO" };
  return { tipo: "DIFERENTE", cadastro: referencia, lidos };
}

/** O que fazer com UM documento lido, diante do CNPJ de referência. */
export type AvaliacaoDocumento =
  /** O documento cita o CNPJ do cadastro: usa esse CNPJ. */
  | { tipo: "USAR"; cnpj: string }
  /** Cita CNPJs válidos, mas nenhum é o do cadastro: descarta e segue procurando. */
  | { tipo: "DESCARTAR"; cnpjs: string[]; problema: string }
  /** Nenhum CNPJ válido no documento: segue o tratamento de sempre (sem CNPJ / dígito inválido). */
  | { tipo: "SEM_CNPJ_VALIDO" };

/**
 * Decide, com o CNPJ de referência (já validado — ver `cnpjDeReferencia`), o que fazer com um
 * documento. `cnpjDoLeitor` é o CNPJ que o leitor de certidão escolheu (pode ser inválido ou
 * null); `texto` é o texto inteiro do documento, de onde saem TODOS os CNPJs citados.
 */
export function avaliarDocumentoComReferencia(
  doc: { nome: string; cnpjDoLeitor: string | null; texto: string },
  referencia: string
): AvaliacaoDocumento {
  const alvo = digitosDoCnpj(referencia);
  const cnpjs = cnpjsValidosDoTexto(doc.texto);
  const doLeitor = digitosDoCnpj(doc.cnpjDoLeitor);
  if (doLeitor && cnpjValido(doLeitor) && !cnpjs.some((c) => digitosDoCnpj(c) === doLeitor)) {
    cnpjs.push(formatarCnpj(doLeitor));
  }
  if (alvo && cnpjs.some((c) => digitosDoCnpj(c) === alvo)) return { tipo: "USAR", cnpj: referencia };
  if (cnpjs.length === 0) return { tipo: "SEM_CNPJ_VALIDO" };
  return {
    tipo: "DESCARTAR",
    cnpjs,
    problema:
      `${doc.nome}: li ${cnpjs.length === 1 ? "o CNPJ" : "os CNPJs"} ${cnpjs.join(", ")}, ` +
      `mas ${cnpjs.length === 1 ? "ele não é" : "nenhum deles é"} o CNPJ desta empresa no Questor (${referencia})`,
  };
}

// ------------------------------------------------------------------
// Cadastro de empresas do Questor, indexado por código
// ------------------------------------------------------------------

/** Uma linha de `getEmpresas` (lib/questor.ts) — só o que se usa aqui. */
export interface LinhaCadastroQuestor {
  codigoempresa: number | string | null;
  cnpj: string | null;
  ativa?: boolean | null;
}

/** O que o cadastro diz de uma empresa. */
export type CadastroEmpresa = { encontrada: false } | { encontrada: true; cnpj: string | null; ativa: boolean };

/** "0576", " 576 " e 576 são o mesmo código; texto não numérico segue como está (sem espaços). */
export function normalizarCodigoEmpresa(codigo: number | string | null | undefined): string {
  const t = String(codigo ?? "").trim();
  return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, "") : t;
}

/**
 * Indexa o cadastro por código. Se o mesmo código vier em mais de uma linha, fica a que
 * tem CNPJ válido (e, entre elas, a ativa) — nunca uma linha sem CNPJ por cima de uma com.
 */
export function indexarCadastro(linhas: LinhaCadastroQuestor[]): Map<string, CadastroEmpresa> {
  const porCodigo = new Map<string, CadastroEmpresa>();
  const nota = (c: CadastroEmpresa) => (c.encontrada ? (cnpjDeReferencia(c.cnpj) ? 2 : 0) + (c.ativa ? 1 : 0) : -1);
  for (const l of linhas) {
    const codigo = normalizarCodigoEmpresa(l.codigoempresa);
    if (!codigo) continue;
    const nova: CadastroEmpresa = { encontrada: true, cnpj: l.cnpj ?? null, ativa: l.ativa !== false };
    const atual = porCodigo.get(codigo);
    if (!atual || nota(nova) > nota(atual)) porCodigo.set(codigo, nova);
  }
  return porCodigo;
}

// ------------------------------------------------------------------
// Textos de status — os mesmos que a Júlia já viu na tela/planilhas.
// ------------------------------------------------------------------

/** Quantos CNPJs lidos aparecem por extenso no status (o resto vira "e mais N"). */
const MAX_LIDOS_NO_STATUS = 4;

/** Motivo (categoria) do "CNPJ errado" é o da lista "CNPJ NÃO ENCONTRADO": a empresa
 * espera o CNPJ certo de quem cuida do cadastro. Este é só o prefixo do status. */
export const PREFIXO_CNPJ_ERRADO = "CNPJ NÃO ENCONTRADO em nenhum documento — puxando CNPJ ERRADO";

/**
 * Status de "o robô só leu CNPJs que não são os desta empresa". `lidos` vem de
 * `conferirCnpjComCadastro` (tipo DIFERENTE).
 */
export function statusCnpjErrado(
  lidos: { arquivo: string; cnpj: string; mesmaRaiz: boolean }[],
  cadastro: string
): string {
  const unicos: typeof lidos = [];
  const vistos = new Set<string>();
  for (const l of lidos) {
    const chave = `${l.cnpj}|${l.arquivo}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    unicos.push(l);
  }
  const itens = unicos.slice(0, MAX_LIDOS_NO_STATUS).map((l) => `${l.cnpj} em "${l.arquivo}"`);
  const resto = unicos.length - itens.length;
  let corpo: string;
  if (unicos.length === 1) {
    corpo = `o robô leu ${itens[0]}, que não é o CNPJ desta empresa (cadastro do Questor: ${cadastro}).`;
  } else {
    corpo =
      `o robô só leu CNPJs que não são o desta empresa (cadastro do Questor: ${cadastro}): ` +
      `${itens.join("; ")}${resto > 0 ? ` e mais ${resto}` : ""}.`;
  }
  const filiais = unicos.filter((l) => l.mesmaRaiz);
  const aviso =
    filiais.length > 0
      ? ` Obs.: ${[...new Set(filiais.map((l) => l.cnpj))].join(", ")} tem(têm) a mesma raiz (8 primeiros dígitos) do cadastro — ` +
        "pode ser outra unidade (matriz/filial) da mesma empresa."
      : "";
  return `${PREFIXO_CNPJ_ERRADO}: ${corpo}${aviso} Aguardando planilha do setor responsável com os CNPJs corretos.`;
}

/** Status quando o CNPJ usado num envio ANTERIOR não é o do cadastro. */
export function statusCnpjDoEnvioAnteriorErrado(cnpjAnterior: string, cadastro: string): string {
  return (
    `${PREFIXO_CNPJ_ERRADO}: o CNPJ usado nos envios anteriores (${cnpjAnterior}) não é o CNPJ desta empresa ` +
    `(cadastro do Questor: ${cadastro}). Por isso o documento novo NÃO foi liberado — confira se o que já foi enviado ` +
    "foi para o cliente certo no Zen. Aguardando planilha do setor responsável com os CNPJs corretos."
  );
}

/** Por que o CNPJ lido não ficou confirmado: empresa fora do cadastro do Questor, cadastro sem CNPJ
 * válido, ou empresa BAIXADA (CNPJ confere, mas a empresa está fora da lista de ativas — quem decide
 * se o documento vai pro Zen é uma pessoa, como na lista dos "47"). */
export type CausaSemReferencia = "ausente" | "sem_cnpj" | "baixada";

/**
 * Status de "não deu pra comparar". `lido` é o CNPJ que o robô tirou do documento e
 * `clienteNoZen` o nome do cliente do Zen com esse CNPJ (null = não é cliente do Zen;
 * undefined = a consulta ao Zen não foi feita/falhou).
 */
/** O "porque" de o CNPJ lido não ter ficado confirmado (usado no status e no aviso do envio individual). */
export function porqueNaoConfirmada(codigo: string, causa: CausaSemReferencia): string {
  if (causa === "baixada") return `a empresa ${codigo} está baixada (fora da lista de empresas ativas do Questor)`;
  if (causa === "ausente") return `a empresa ${codigo} não consta no cadastro de empresas do Questor`;
  return `o cadastro da empresa ${codigo} no Questor não tem um CNPJ válido`;
}

/**
 * Aviso que acompanha uma empresa PRONTA no envio individual (quando a pessoa confere o CNPJ e
 * o cliente do Zen na tela antes de confirmar): o CNPJ não pôde ser confirmado no cadastro, e
 * quem libera é ela. Na varredura (sem ninguém olhando) isso é bloqueio, não aviso.
 */
export function avisoCnpjNaoConfirmado(codigo: string, causa: CausaSemReferencia): string {
  return (
    ` ATENÇÃO — CNPJ NÃO CONFIRMADO NO QUESTOR: ${porqueNaoConfirmada(codigo, causa)}` +
    (causa === "baixada" ? "" : ", então o CNPJ lido não pôde ser comparado") +
    ". Confira na tela se o cliente do Zen é mesmo o desta empresa antes de confirmar."
  );
}

export function statusCnpjNaoConfirmado(params: {
  codigo: string;
  lido: string;
  causa: CausaSemReferencia;
  clienteNoZen?: string | null;
}): string {
  const { codigo, lido, causa, clienteNoZen } = params;
  const cliente =
    clienteNoZen === undefined
      ? ""
      : clienteNoZen === null
        ? " (esse CNPJ não consta como cliente no Zen)"
        : ` (cliente no Zen: ${clienteNoZen})`;
  if (causa === "baixada") {
    return (
      `CNPJ NÃO CONFIRMADO NO QUESTOR: o robô leu ${lido}${cliente}, e esse é o CNPJ do cadastro, mas a empresa ` +
      `${codigo} está baixada (fora da lista de empresas ativas do Questor). Bloqueada por precaução até a confirmação.`
    );
  }
  const porque =
    causa === "ausente"
      ? `a empresa ${codigo} não consta no cadastro de empresas do Questor`
      : `o cadastro da empresa ${codigo} no Questor não tem um CNPJ válido`;
  return (
    `CNPJ NÃO CONFIRMADO NO QUESTOR: o robô leu ${lido}${cliente}, mas ${porque}, ` +
    "então o CNPJ não pôde ser comparado. Bloqueada por precaução até a confirmação."
  );
}
