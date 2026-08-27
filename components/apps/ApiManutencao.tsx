"use client";

import { useState } from "react";

interface Status {
  ativo?: boolean; // true = EM MANUTENÇÃO (API desligada para os clientes)
  motivo?: string | null;
  desde?: string | null;
}

export default function ApiManutencao({ souTI }: { souTI: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [alternando, setAlternando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [consultado, setConsultado] = useState(false);

  async function consultar() {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/tecnologia/questor-manutencao", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Falha ao consultar."); return; }
      setStatus(j);
      setConsultado(true);
    } catch {
      setErro("Falha de rede ao consultar a API.");
    } finally {
      setCarregando(false);
    }
  }

  async function alternar(ligar: boolean) {
    if (!ligar && !confirm(
      "Desligar a API Questor agora?\n\nTodas as rotas de dados vão parar de responder (503) para todos os sistemas que consomem — inclusive o Financeiro e o Fiscal deste Núcleo. Use antes de uma atualização."
    )) return;

    setAlternando(true);
    setErro(null);
    try {
      const r = await fetch("/api/tecnologia/questor-manutencao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !ligar, motivo: !ligar ? (motivo.trim() || undefined) : undefined }),
      });
      const j = await r.json();
      if (!r.ok) { setErro(j.error ?? "Falha ao alterar o estado."); return; }
      await consultar();
      if (ligar) setMotivo("");
    } catch {
      setErro("Falha de rede ao alterar o estado.");
    } finally {
      setAlternando(false);
    }
  }

  if (!souTI) {
    return (
      <div className="painel-api">
        <div className="painel-api-head">
          <h3>API Questor</h3>
        </div>
        <p className="nota">
          Ligar/desligar a API é restrito às pessoas cadastradas no setor de TI.
          Fale com a Tecnologia se precisar de uma manutenção.
        </p>
      </div>
    );
  }

  const desligada = consultado && status?.ativo === true;

  return (
    <div className="painel-api">
      <div className="painel-api-head">
        <h3>API Questor</h3>
        {!consultado ? (
          <button className="btn" onClick={consultar} disabled={carregando}>
            {carregando ? "Consultando…" : "Ver estado atual"}
          </button>
        ) : (
          <button className="btn" onClick={consultar} disabled={carregando}>↻ Atualizar</button>
        )}
      </div>

      {erro && <div className="banner error">{erro}</div>}

      {consultado && (
        <div className={`estado-api ${desligada ? "off" : "on"}`}>
          <span className="ponto" />
          <div>
            <div className="estado-api-titulo">
              {desligada ? "Em manutenção — clientes recebem 503" : "No ar — respondendo normalmente"}
            </div>
            {desligada && status?.motivo && (
              <div className="estado-api-sub">Motivo: {status.motivo}</div>
            )}
            {status?.desde && (
              <div className="estado-api-sub">Desde {new Date(status.desde).toLocaleString("pt-BR")}</div>
            )}
          </div>
        </div>
      )}

      {consultado && !desligada && (
        <div className="acao-api">
          <label>
            <span>Motivo (aparece para quem consultar o estado)</span>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="ex.: atualização de versão"
            />
          </label>
          <button className="btn danger" onClick={() => alternar(false)} disabled={alternando}>
            {alternando ? "Desligando…" : "Desligar API"}
          </button>
        </div>
      )}

      {consultado && desligada && (
        <div className="acao-api">
          <button className="btn primary" onClick={() => alternar(true)} disabled={alternando}>
            {alternando ? "Religando…" : "Religar API"}
          </button>
        </div>
      )}

      <p className="nota">
        Ao desligar, todas as rotas de dados da API Questor (Financeiro, Fiscal e demais consumidores)
        passam a responder <code>503</code> e o pool de conexão com o banco do Questor é fechado — nenhuma
        consulta é feita enquanto estiver desligada. Use antes de subir uma atualização e religue assim
        que terminar. O estado é lido em tempo real, direto da API.
      </p>
    </div>
  );
}
