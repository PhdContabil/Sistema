"use client";

import GenericCrudTab, { type CampoConfig, type ColunaConfig } from "./GenericCrudTab";

interface EtapaRoteiro {
  id: string;
  titulo: string;
  descricao: string;
  ordem: number | null;
  dias: number | null;
}

const COLUNAS: ColunaConfig<EtapaRoteiro>[] = [
  { chave: "ordem", rotulo: "Ordem" },
  { chave: "titulo", rotulo: "Etapa" },
  { chave: "descricao", rotulo: "Descrição" },
  { chave: "dias", rotulo: "Dias" },
];

const CAMPOS: CampoConfig<EtapaRoteiro>[] = [
  { chave: "titulo", rotulo: "Etapa", obrigatorio: true },
  { chave: "ordem", rotulo: "Ordem", tipo: "number" },
  { chave: "dias", rotulo: "Dias", tipo: "number" },
  { chave: "descricao", rotulo: "Descrição", tipo: "textarea" },
];

const VAZIO: Omit<EtapaRoteiro, "id"> = { titulo: "", descricao: "", ordem: null, dias: null };

export default function RoteiroTab() {
  return (
    <GenericCrudTab<EtapaRoteiro>
      api="/api/paralegal/roteiro"
      colunas={COLUNAS}
      campos={CAMPOS}
      vazio={VAZIO}
      buscaCampos={["titulo", "descricao"]}
      tituloItem={(e) => e.titulo}
      nomeNovo="Nova etapa"
    />
  );
}
