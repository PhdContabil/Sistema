"use client";

import { useState } from "react";
import InformeRendimentos from "./InformeRendimentos";
import LucrosDistribuidos from "./LucrosDistribuidos";
import type { LinhaLog } from "@/lib/informe-rendimentos-log";
import type { LinhaLogLucro } from "@/lib/lucros-distribuidos-log";

type Aba = "informe" | "lucros";

const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: "informe", rotulo: "Informe de Rendimentos" },
  { id: "lucros", rotulo: "Lucros Distribuídos" },
];

/** Casca do app "Sistema Contábil": uma aba para cada formulário migrado do Access. */
export default function SistemaContabil({
  empresas, logInforme, logLucros, erroServidor,
}: {
  empresas: Array<{ codigo: number; nome: string }>;
  logInforme: LinhaLog[];
  logLucros: LinhaLogLucro[];
  erroServidor: string | null;
}) {
  const [aba, setAba] = useState<Aba>("informe");

  return (
    <>
      <div role="tablist" style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {ABAS.map((a) => (
          <button
            key={a.id} role="tab" aria-selected={aba === a.id}
            className={aba === a.id ? "btn primary" : "btn"}
            onClick={() => setAba(a.id)}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      {/* As duas ficam montadas: trocar de aba não perde o que foi digitado. */}
      <div hidden={aba !== "informe"}>
        <InformeRendimentos empresas={empresas} logInicial={logInforme} erroServidor={erroServidor} />
      </div>
      <div hidden={aba !== "lucros"}>
        <LucrosDistribuidos empresas={empresas} logInicial={logLucros} erroServidor={erroServidor} />
      </div>
    </>
  );
}
