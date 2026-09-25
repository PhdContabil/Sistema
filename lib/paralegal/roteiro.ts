// Roteiro de Troca do Paralegal System (migrado) — lista SharePoint "roteirotroca".
import { listarItens, obterItem, criarItem, atualizarItem, excluirItem, type ItemLista } from "./graph";

const LISTA = "roteirotroca";

export interface EtapaRoteiro {
  id: string;
  titulo: string;
  descricao: string;
  ordem: number | null;
  dias: number | null;
}

interface CamposSP {
  [key: string]: unknown;
  Title?: string;
  descricao?: string;
  ordem?: number;
  dias?: number;
}

function converter(item: ItemLista<CamposSP>): EtapaRoteiro {
  return {
    id: item.id,
    titulo: item.fields.Title ?? "",
    descricao: item.fields.descricao ?? "",
    ordem: item.fields.ordem ?? null,
    dias: item.fields.dias ?? null,
  };
}

function paraCampos(d: Partial<Omit<EtapaRoteiro, "id">>): CamposSP {
  const c: CamposSP = {};
  if (d.titulo !== undefined) c.Title = d.titulo;
  if (d.descricao !== undefined) c.descricao = d.descricao;
  if (d.ordem !== undefined) c.ordem = d.ordem ?? undefined;
  if (d.dias !== undefined) c.dias = d.dias ?? undefined;
  return c;
}

export async function listarRoteiro(): Promise<EtapaRoteiro[]> {
  const itens = await listarItens<CamposSP>(LISTA);
  return itens.map(converter).sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));
}

export async function obterEtapa(id: string): Promise<EtapaRoteiro> {
  return converter(await obterItem<CamposSP>(LISTA, id));
}

export async function criarEtapa(d: Omit<EtapaRoteiro, "id">): Promise<EtapaRoteiro> {
  return converter(await criarItem<CamposSP>(LISTA, paraCampos(d)));
}

export async function atualizarEtapa(id: string, d: Partial<Omit<EtapaRoteiro, "id">>): Promise<void> {
  await atualizarItem<CamposSP>(LISTA, id, paraCampos(d));
}

export async function excluirEtapa(id: string): Promise<void> {
  await excluirItem(LISTA, id);
}
