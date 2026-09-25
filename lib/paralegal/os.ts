// Ordens de Serviço do Paralegal System (migrado) — lista SharePoint "osfinanceiro".
//
// Os campos "Serviço1".."Serviço4" têm o nome interno escapado pelo SharePoint
// por causa do "ç" (Servi_x00e7_oN) — mesma pegadinha do sistema antigo.
import { listarItens, obterItem, criarItem, atualizarItem, excluirItem, type ItemLista } from "./graph";

const LISTA = "osfinanceiro";

export interface OS {
  id: string;
  titulo: string;
  data: string | null;
  codigo: string;
  tipo: string;
  questor: string;
  razao: string;
  cnpj: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  cep: string;
  contato: string;
  email: string;
  telefone: string;
  celular: string;
  indicacao: string;
  tratadoCom: string;
  natJuridica: string;
  outraEmpresa: string;
  obs: string;
  usuario: string;
  dataInicio: string | null;
  servicos: [string, string, string, string];
  valoresServ: [number | null, number | null, number | null, number | null];
  valorTT: number | null;
  obsGerais: string;
}

interface CamposSP {
  [key: string]: unknown;
  Title?: string;
  data?: string;
  codigo?: string;
  tipo?: string;
  questor?: string;
  razao?: string;
  cnpj?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  cep?: string;
  contato?: string;
  email?: string;
  telefone?: string;
  celular?: string;
  indicacao?: string;
  tratadocom?: string;
  natjuridica?: string;
  outraempresa?: string;
  obs?: string;
  usuario?: string;
  datainicio?: string;
  Servi_x00e7_o1?: string;
  Servi_x00e7_o2?: string;
  Servi_x00e7_o3?: string;
  Servi_x00e7_o4?: string;
  ValorServ1?: number;
  ValorServ2?: number;
  ValorServ3?: number;
  ValorServ4?: number;
  ValorTT?: number;
  obsgerais?: string;
}

function converter(item: ItemLista<CamposSP>): OS {
  const f = item.fields;
  return {
    id: item.id,
    titulo: f.Title ?? "",
    data: f.data ?? null,
    // Campo "codigo" próprio da lista (numeração da OS) — não confundir com o
    // ID nativo do SharePoint. É texto normal, editável; o valor sugerido pra
    // OS nova é calculado no front ao abrir a tela (ver proximoCodigo em OSTab).
    codigo: f.codigo ?? "",
    tipo: f.tipo ?? "",
    questor: f.questor ?? "",
    razao: f.razao ?? "",
    cnpj: f.cnpj ?? "",
    logradouro: f.logradouro ?? "",
    numero: f.numero ?? "",
    complemento: f.complemento ?? "",
    bairro: f.bairro ?? "",
    cidade: f.cidade ?? "",
    cep: f.cep ?? "",
    contato: f.contato ?? "",
    email: f.email ?? "",
    telefone: f.telefone ?? "",
    celular: f.celular ?? "",
    indicacao: f.indicacao ?? "",
    tratadoCom: f.tratadocom ?? "",
    natJuridica: f.natjuridica ?? "",
    outraEmpresa: f.outraempresa ?? "",
    obs: f.obs ?? "",
    usuario: f.usuario ?? "",
    dataInicio: f.datainicio ?? null,
    servicos: [f.Servi_x00e7_o1 ?? "", f.Servi_x00e7_o2 ?? "", f.Servi_x00e7_o3 ?? "", f.Servi_x00e7_o4 ?? ""],
    valoresServ: [f.ValorServ1 ?? null, f.ValorServ2 ?? null, f.ValorServ3 ?? null, f.ValorServ4 ?? null],
    valorTT: f.ValorTT ?? null,
    obsGerais: f.obsgerais ?? "",
  };
}

function paraCampos(d: Partial<Omit<OS, "id">>): CamposSP {
  const c: CamposSP = {};
  if (d.titulo !== undefined) c.Title = d.titulo;
  if (d.data !== undefined) c.data = d.data ?? undefined;
  if (d.codigo !== undefined) c.codigo = d.codigo;
  if (d.tipo !== undefined) c.tipo = d.tipo;
  if (d.questor !== undefined) c.questor = d.questor;
  if (d.razao !== undefined) c.razao = d.razao;
  if (d.cnpj !== undefined) c.cnpj = d.cnpj;
  if (d.logradouro !== undefined) c.logradouro = d.logradouro;
  if (d.numero !== undefined) c.numero = d.numero;
  if (d.complemento !== undefined) c.complemento = d.complemento;
  if (d.bairro !== undefined) c.bairro = d.bairro;
  if (d.cidade !== undefined) c.cidade = d.cidade;
  if (d.cep !== undefined) c.cep = d.cep;
  if (d.contato !== undefined) c.contato = d.contato;
  if (d.email !== undefined) c.email = d.email;
  if (d.telefone !== undefined) c.telefone = d.telefone;
  if (d.celular !== undefined) c.celular = d.celular;
  if (d.indicacao !== undefined) c.indicacao = d.indicacao;
  if (d.tratadoCom !== undefined) c.tratadocom = d.tratadoCom;
  if (d.natJuridica !== undefined) c.natjuridica = d.natJuridica;
  if (d.outraEmpresa !== undefined) c.outraempresa = d.outraEmpresa;
  if (d.obs !== undefined) c.obs = d.obs;
  if (d.usuario !== undefined) c.usuario = d.usuario;
  if (d.dataInicio !== undefined) c.datainicio = d.dataInicio ?? undefined;
  if (d.servicos !== undefined) {
    c.Servi_x00e7_o1 = d.servicos[0]; c.Servi_x00e7_o2 = d.servicos[1];
    c.Servi_x00e7_o3 = d.servicos[2]; c.Servi_x00e7_o4 = d.servicos[3];
  }
  if (d.valoresServ !== undefined) {
    c.ValorServ1 = d.valoresServ[0] ?? undefined; c.ValorServ2 = d.valoresServ[1] ?? undefined;
    c.ValorServ3 = d.valoresServ[2] ?? undefined; c.ValorServ4 = d.valoresServ[3] ?? undefined;
  }
  if (d.valorTT !== undefined) c.ValorTT = d.valorTT ?? undefined;
  if (d.obsGerais !== undefined) c.obsgerais = d.obsGerais;
  return c;
}

export async function listarOS(): Promise<OS[]> {
  const itens = await listarItens<CamposSP>(LISTA);
  return itens.map(converter).sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
}

export async function obterOS(id: string): Promise<OS> {
  return converter(await obterItem<CamposSP>(LISTA, id));
}

export async function criarOS(d: Omit<OS, "id">): Promise<OS> {
  return converter(await criarItem<CamposSP>(LISTA, paraCampos(d)));
}

export async function atualizarOS(id: string, d: Partial<Omit<OS, "id">>): Promise<void> {
  await atualizarItem<CamposSP>(LISTA, id, paraCampos(d));
}

export async function excluirOS(id: string): Promise<void> {
  await excluirItem(LISTA, id);
}
