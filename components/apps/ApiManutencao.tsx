"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Espelha o que a API devolve. Nada de deduzir estado aqui: `online` e
 * `status_label` vêm prontos do servidor.
 *
 * Cuidado herdado de um bug real: o /health responde HTTP 200 mesmo em
 * manutenção (é o liveness do HAProxy). Quem diz se está no ar é o campo
 * `manutencao`, nunca o código HTTP.
 */
interface Estado {
  manutencao: boolean;
  online: boolean;
  status: string | null;
  status_label: string | null;
  mensagem: string | null;
  desde: string | null;
  motivo: string | null;
  podeOperar: boolean;
  erro_leitura?: string;
}

export default function ApiManutencao() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [alternando, setAlternando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const consultar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/tecnologia/questor-manutencao", { cache: "no-store" });
      const j = await r.json();
      setEstado(j);
      if (j.erro_leitura) setErro(j.erro_leitura);
      else if (!r.ok) setErro(j.error ?? "Falha ao consultar.");
    } catch {
      setErro("Falha de rede ao consultar o estado.");
    } finally {
      setCarregando(false);
    }
  }, []);

  // O estado é público (vem do /health), então já carrega ao abrir a tela.
  useEffect(() => { consultar(); }, [consultar]);

  async function alternar(ligar: boolean) {
    if (!ligar && !confirm(
      "Desligar a API Questor agora?\n\nTodas as rotas de dados passam a responder 503 para todos os consumidores — inclusive o Financeiro e o Fiscal deste Núcleo. Use antes de uma atualização."
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
      if (ligar) setMotivo("");
      await consultar();
    } catch {
      setErro("Falha de rede ao alterar o estado.");
    } finally {
      setAlternando(false);
    }
  }

  const podeOperar = estado?.podeOperar ?? false;
  const leituraOk = !!estado && typeof estado.manutencao === "boolean";

  return (
    <div className="painel-api">
      <div className="painel-api-head">
        <h3>API Questor</h3>
        <button className="btn" onClick={consultar} disabled={carregando}>
          {carregando ? "Consultando…" : "↻ Atualizar"}
        </button>
      </div>

      {erro && <div className="banner error">{erro}</div>}

      {leituraOk && (
        <div className={`estado-api ${estado.online ? "on" : "off"}`}>
          <span className="ponto" />
          <div>
            <div className="estado-api-titulo">
              {estado.status_label ?? (estado.online ? "No ar" : "Em manutenção")}
            </div>
            {estado.mensagem && <div className="estado-api-sub">{estado.mensagem}</div>}
          </div>
        </div>
      )}

      {!leituraOk && !carregando && (
        <div className="estado-api off">
          <span className="ponto" />
          <div>
            <div className="estado-api-titulo">Estado desconhecido</div>
            <div className="estado-api-sub">Não foi possível ler o estado da API.</div>
          </div>
        </div>
      )}

      {podeOperar && leituraOk && !estado.manutencao && (
        <div className="acao-api">
          <label>
            <span>Motivo (aparece na mensagem de manutenção)</span>
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

      {podeOperar && leituraOk && estado.manutencao && (
        <div className="acao-api">
          <button className="btn primary" onClick={() => alternar(true)} disabled={alternando}>
            {alternando ? "Religando…" : "Religar API"}
          </button>
        </div>
      )}

      <p className="nota">
        {podeOperar ? (
          <>
            Ao desligar, todas as rotas de dados da API Questor (Financeiro, Fiscal e demais
            consumidores) passam a responder <code>503</code> e o pool de conexão com o banco do
            Questor é fechado. Religue assim que a atualização terminar.
          </>
        ) : (
          <>
            Ligar e desligar a API é restrito às pessoas cadastradas no setor de TI.
            O estado acima é informativo — se estiver em manutenção, as telas de Financeiro
            e Fiscal não vão carregar dados até religarem.
          </>
        )}
      </p>
    </div>
  );
}
