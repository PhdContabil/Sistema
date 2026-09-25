"use client";

import GenericCrudTab, { type CampoConfig, type ColunaConfig } from "./GenericCrudTab";

interface Indicacao {
  id: string;
  nome: string;
  telefone: string;
  celular: string;
  whatsapp: string;
}

const COLUNAS: ColunaConfig<Indicacao>[] = [
  { chave: "nome", rotulo: "Nome" },
  { chave: "telefone", rotulo: "Telefone" },
  { chave: "celular", rotulo: "Celular" },
  { chave: "whatsapp", rotulo: "WhatsApp" },
];

const CAMPOS: CampoConfig<Indicacao>[] = [
  { chave: "nome", rotulo: "Nome", obrigatorio: true },
  { chave: "telefone", rotulo: "Telefone" },
  { chave: "celular", rotulo: "Celular" },
  { chave: "whatsapp", rotulo: "WhatsApp" },
];

const VAZIO: Omit<Indicacao, "id"> = { nome: "", telefone: "", celular: "", whatsapp: "" };

export default function IndicacoesTab() {
  return (
    <GenericCrudTab<Indicacao>
      api="/api/paralegal/indicacoes"
      colunas={COLUNAS}
      campos={CAMPOS}
      vazio={VAZIO}
      buscaCampos={["nome", "telefone", "celular"]}
      tituloItem={(i) => i.nome}
      nomeNovo="Nova indicação"
    />
  );
}
