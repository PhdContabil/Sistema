"use client";

import { useState } from "react";
import "./controle.css";
import CadastroEmpresaTab from "./CadastroEmpresaTab";
import EmpresasTab from "./EmpresasTab";
import ContratosTab from "./ContratosTab";
import OSTab from "./OSTab";
import IndicacoesTab from "./IndicacoesTab";
import RoteiroTab from "./RoteiroTab";

const ABAS = [
  { id: "cadastro", nome: "Cadastro" },
  { id: "empresas", nome: "Empresas" },
  { id: "contratos", nome: "Contratos" },
  { id: "os", nome: "Ordens de Serviço" },
  { id: "indicacoes", nome: "Indicações" },
  { id: "roteiro", nome: "Roteiro de Troca" },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

export default function Controle() {
  const [aba, setAba] = useState<AbaId>("cadastro");
  const [prefillCadastro, setPrefillCadastro] = useState<{ nome: string; empresa: string; cnpj: string } | null>(null);

  return (
    <div className="controle-app">
      <div className="pl-abas">
        {ABAS.map((a) => (
          <button
            key={a.id}
            className={`pl-aba${aba === a.id ? " ativa" : ""}`}
            onClick={() => setAba(a.id)}
          >
            {a.nome}
          </button>
        ))}
      </div>

      {aba === "cadastro" && (
        <CadastroEmpresaTab prefill={prefillCadastro} onPrefillConsumido={() => setPrefillCadastro(null)} />
      )}
      {aba === "empresas" && (
        <EmpresasTab
          onRecadastrar={(dados) => {
            setPrefillCadastro(dados);
            setAba("cadastro");
          }}
        />
      )}
      {aba === "contratos" && <ContratosTab />}
      {aba === "os" && <OSTab />}
      {aba === "indicacoes" && <IndicacoesTab />}
      {aba === "roteiro" && <RoteiroTab />}
    </div>
  );
}
