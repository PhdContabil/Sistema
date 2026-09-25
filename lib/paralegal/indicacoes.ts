// Indicações do Paralegal System (migrado) — lista SharePoint "indicacoes".
import { listarItens, obterItem, criarItem, atualizarItem, excluirItem, type ItemLista } from "./graph";

const LISTA = "indicacoes";

export interface Indicacao {
  id: string;
  nome: string;
  telefone: string;
  celular: string;
  whatsapp: string;
}

interface CamposSP {
  [key: string]: unknown;
  Nome?: string;
  Telefone?: string;
  Celular?: string;
  Whatsapp?: string;
}

function converter(item: ItemLista<CamposSP>): Indicacao {
  return {
    id: item.id,
    nome: item.fields.Nome ?? "",
    telefone: item.fields.Telefone ?? "",
    celular: item.fields.Celular ?? "",
    whatsapp: item.fields.Whatsapp ?? "",
  };
}

function paraCampos(d: Partial<Omit<Indicacao, "id">>): CamposSP {
  const c: CamposSP = {};
  if (d.nome !== undefined) c.Nome = d.nome;
  if (d.telefone !== undefined) c.Telefone = d.telefone;
  if (d.celular !== undefined) c.Celular = d.celular;
  if (d.whatsapp !== undefined) c.Whatsapp = d.whatsapp;
  return c;
}

export async function listarIndicacoes(): Promise<Indicacao[]> {
  const itens = await listarItens<CamposSP>(LISTA);
  return itens.map(converter).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function obterIndicacao(id: string): Promise<Indicacao> {
  return converter(await obterItem<CamposSP>(LISTA, id));
}

export async function criarIndicacao(d: Omit<Indicacao, "id">): Promise<Indicacao> {
  return converter(await criarItem<CamposSP>(LISTA, paraCampos(d)));
}

export async function atualizarIndicacao(id: string, d: Partial<Omit<Indicacao, "id">>): Promise<void> {
  await atualizarItem<CamposSP>(LISTA, id, paraCampos(d));
}

export async function excluirIndicacao(id: string): Promise<void> {
  await excluirItem(LISTA, id);
}
