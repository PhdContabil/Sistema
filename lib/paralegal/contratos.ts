// Contratos do Paralegal System (migrado) — lista SharePoint "ControleContrato".
import { listarItens, obterItem, criarItem, atualizarItem, excluirItem, type ItemLista } from "./graph";

const LISTA = "ControleContrato";

export interface Contrato {
  id: string;
  titulo: string;
  codigoEmpresa: string;
  cnpj: string;
  filial: string;
  socio: string;
  razaoSocial: string;
  contratoTexto: string;
  dataEmissao: string | null;
  dataInicio: string | null;
  dataAssinado: string | null;
  origem: string;
}

interface CamposSP {
  [key: string]: unknown;
  Title?: string;
  CodigoEmpresa?: string;
  Cnpj?: string;
  Filial?: string;
  Socio?: string;
  RazaoSocial?: string;
  ContratoTexto?: string;
  DataEmissao?: string;
  DataInicio?: string;
  DataAssinado?: string;
  Origem?: string;
}

function converter(item: ItemLista<CamposSP>): Contrato {
  return {
    id: item.id,
    titulo: item.fields.Title ?? "",
    codigoEmpresa: item.fields.CodigoEmpresa ?? "",
    cnpj: item.fields.Cnpj ?? "",
    filial: item.fields.Filial ?? "",
    socio: item.fields.Socio ?? "",
    razaoSocial: item.fields.RazaoSocial ?? "",
    contratoTexto: item.fields.ContratoTexto ?? "",
    dataEmissao: item.fields.DataEmissao ?? null,
    dataInicio: item.fields.DataInicio ?? null,
    dataAssinado: item.fields.DataAssinado ?? null,
    origem: item.fields.Origem ?? "",
  };
}

function paraCampos(d: Partial<Omit<Contrato, "id">>): CamposSP {
  const c: CamposSP = {};
  if (d.titulo !== undefined) c.Title = d.titulo;
  if (d.codigoEmpresa !== undefined) c.CodigoEmpresa = d.codigoEmpresa;
  if (d.cnpj !== undefined) c.Cnpj = d.cnpj;
  if (d.filial !== undefined) c.Filial = d.filial;
  if (d.socio !== undefined) c.Socio = d.socio;
  if (d.razaoSocial !== undefined) c.RazaoSocial = d.razaoSocial;
  if (d.contratoTexto !== undefined) c.ContratoTexto = d.contratoTexto;
  if (d.dataEmissao !== undefined) c.DataEmissao = d.dataEmissao ?? undefined;
  if (d.dataInicio !== undefined) c.DataInicio = d.dataInicio ?? undefined;
  if (d.dataAssinado !== undefined) c.DataAssinado = d.dataAssinado ?? undefined;
  if (d.origem !== undefined) c.Origem = d.origem;
  return c;
}

export async function listarContratos(): Promise<Contrato[]> {
  const itens = await listarItens<CamposSP>(LISTA);
  return itens.map(converter).sort((a, b) => (b.dataEmissao ?? "").localeCompare(a.dataEmissao ?? ""));
}

export async function obterContrato(id: string): Promise<Contrato> {
  return converter(await obterItem<CamposSP>(LISTA, id));
}

export async function criarContrato(d: Omit<Contrato, "id">): Promise<Contrato> {
  return converter(await criarItem<CamposSP>(LISTA, paraCampos(d)));
}

export async function atualizarContrato(id: string, d: Partial<Omit<Contrato, "id">>): Promise<void> {
  await atualizarItem<CamposSP>(LISTA, id, paraCampos(d));
}

export async function excluirContrato(id: string): Promise<void> {
  await excluirItem(LISTA, id);
}
