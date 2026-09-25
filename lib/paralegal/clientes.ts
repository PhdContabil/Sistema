// Clientes do Paralegal System (migrado) — lista SharePoint "Clientes".
//
// Campos herdados do formulário antigo (cliente-form.html): Nome, Empresa,
// CNPJ, Indicação, Categoria, Vendedor.
import { listarItens, obterItem, criarItem, atualizarItem, excluirItem, type ItemLista } from "./graph";

const LISTA = "Clientes";

export interface Cliente {
  id: string;
  nome: string;
  empresa: string;
  cnpj: string;
  indicacao: string;
  categoria: string;
  vendedor: string;
}

interface CamposClienteSP {
  [key: string]: unknown;
  Nome?: string;
  Empresa?: string;
  CNPJ?: string;
  Indicacao?: string;
  Categoria?: string;
  Vendedor?: string;
}

function converter(item: ItemLista<CamposClienteSP>): Cliente {
  return {
    id: item.id,
    nome: item.fields.Nome ?? "",
    empresa: item.fields.Empresa ?? "",
    cnpj: item.fields.CNPJ ?? "",
    indicacao: item.fields.Indicacao ?? "",
    categoria: item.fields.Categoria ?? "",
    vendedor: item.fields.Vendedor ?? "",
  };
}

function paraCampos(dados: Partial<Omit<Cliente, "id">>): CamposClienteSP {
  const c: CamposClienteSP = {};
  if (dados.nome !== undefined) c.Nome = dados.nome;
  if (dados.empresa !== undefined) c.Empresa = dados.empresa;
  if (dados.cnpj !== undefined) c.CNPJ = dados.cnpj;
  if (dados.indicacao !== undefined) c.Indicacao = dados.indicacao;
  if (dados.categoria !== undefined) c.Categoria = dados.categoria;
  if (dados.vendedor !== undefined) c.Vendedor = dados.vendedor;
  return c;
}

export async function listarClientes(): Promise<Cliente[]> {
  const itens = await listarItens<CamposClienteSP>(LISTA);
  return itens.map(converter).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function obterCliente(id: string): Promise<Cliente> {
  return converter(await obterItem<CamposClienteSP>(LISTA, id));
}

export async function criarCliente(dados: Omit<Cliente, "id">): Promise<Cliente> {
  const item = await criarItem<CamposClienteSP>(LISTA, paraCampos(dados));
  return converter(item);
}

export async function atualizarCliente(id: string, dados: Partial<Omit<Cliente, "id">>): Promise<void> {
  await atualizarItem<CamposClienteSP>(LISTA, id, paraCampos(dados));
}

export async function excluirCliente(id: string): Promise<void> {
  await excluirItem(LISTA, id);
}
