// Lucros Distribuídos — orquestração no SERVIDOR: valida a entrada, confere que
// o sócio pertence à empresa e devolve os nomes para o log. Compartilhado pelas
// rotas de calcular, lançar, ajustar e excluir.

import { getEmpresas, getSocios } from "./questor";
import {
  LucroInvalido, ehData, montarAjuste, montarPlano,
  type EntradaAjuste, type EntradaLucro, type PlanoAjuste, type PlanoLucro,
} from "./lucros-distribuidos";

export class ErroLucro extends Error {
  status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.status = status;
  }
}

function numero(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  // Aceita "1.234,56" e "1234.56".
  const s = String(v).trim();
  return s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
}

export function lerEntrada(c: Record<string, unknown>): EntradaLucro {
  return {
    codigoempresa: Number(c.codigoempresa),
    codigosocio: Number(c.codigosocio),
    competencia: String(c.competencia ?? ""),
    dataPagamento: String(c.dataPagamento ?? ""),
    rendimento: numero(c.rendimento),
    baseIrrf: numero(c.baseIrrf),
    imposto: numero(c.imposto),
    tisencao: Number(c.tisencao ?? 1),
  };
}

export interface Nomes { nomeEmpresa: string | null; nomeSocio: string | null }

/** Sócio ATUAL da empresa (mesmo filtro do Access: DATAFIMSOCIO em aberto). */
export async function resolverNomes(codigoempresa: number, codigosocio: number): Promise<Nomes> {
  const [emp, soc] = await Promise.all([getEmpresas(true), getSocios(false)]);
  const empresa = (emp.dados ?? []).find((e) => e.codigoempresa === codigoempresa);
  if (!empresa) throw new ErroLucro(`Empresa ${codigoempresa} não encontrada no Questor.`, 404);
  const socio = (soc.dados ?? []).find((s) => s.codigoempresa === codigoempresa && s.codigosocio === codigosocio);
  if (!socio) throw new ErroLucro(`O sócio ${codigosocio} não é sócio atual da empresa ${codigoempresa}.`, 422);
  return { nomeEmpresa: empresa.nome ?? null, nomeSocio: socio.nomesocio ?? null };
}

function traduzir<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof LucroInvalido) throw new ErroLucro(e.message, 400);
    throw e;
  }
}

export async function prepararLancamento(c: Record<string, unknown>): Promise<{ plano: PlanoLucro } & Nomes> {
  const plano = traduzir(() => montarPlano(lerEntrada(c)));
  const nomes = await resolverNomes(plano.entrada.codigoempresa, plano.entrada.codigosocio);
  return { plano, ...nomes };
}

export async function prepararAjuste(c: Record<string, unknown>): Promise<{ plano: PlanoAjuste } & Nomes> {
  if (!ehData(String(c.dataAtual ?? ""))) throw new ErroLucro("Data atual do lançamento inválida.", 400);
  const entrada: EntradaAjuste = { ...lerEntrada(c), chave: Number(c.chave), dataAtual: String(c.dataAtual) };
  const plano = traduzir(() => montarAjuste(entrada));
  const nomes = await resolverNomes(entrada.codigoempresa, entrada.codigosocio);
  return { plano, ...nomes };
}
