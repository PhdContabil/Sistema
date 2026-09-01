"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Exclusão de uma rodada de dissídio.
 *
 * Ação irreversível que leva junto todos os ajustes do ano, então pedimos que
 * a pessoa digite o ano — confirmar no "ok" de um alert é fácil demais de fazer
 * sem ler.
 */
export default function ExcluirRodada({
  ano, ajustes,
}: {
  ano: number;
  ajustes: number;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function excluir() {
    setExcluindo(true);
    setErro(null);
    try {
      const r = await fetch(`/api/dissidio/${ano}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmacao: texto.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não foi possível excluir."); return; }
      setAberto(false);
      setTexto("");
      router.refresh();
    } catch {
      setErro("Falha de rede ao excluir.");
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <>
      <button className="btn danger" onClick={() => setAberto(true)}>Excluir</button>

      {aberto && (
        <div className="modal-bg" onClick={() => setAberto(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "min(520px, 100%)" }}>
            <div className="modal-head">
              <h2>Excluir a rodada de {ano}</h2>
              <button className="btn icon" onClick={() => setAberto(false)} aria-label="Fechar">✕</button>
            </div>
            <div className="modal-body">
              {erro && <div className="banner error">{erro}</div>}
              <p>
                Isto apaga a rodada de <strong>{ano}</strong> e as{" "}
                <strong>{ajustes} decisão(ões)</strong> registradas nela — percentuais, valores,
                observações e a autoria de cada análise.
              </p>
              <p className="nota">
                Não há como desfazer. As marcas de <strong>blacklist</strong> e os{" "}
                <strong>responsáveis</strong> das empresas não são afetados, porque pertencem à
                empresa e não à rodada.
              </p>
              <label className="campo-inline larga" style={{ marginTop: 12 }}>
                <span>Digite <strong>{ano}</strong> para confirmar</span>
                <input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={String(ano)}
                  autoFocus
                />
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setAberto(false)} disabled={excluindo}>Cancelar</button>{" "}
              <button
                className="btn danger"
                onClick={excluir}
                disabled={excluindo || texto.trim() !== String(ano)}
              >
                {excluindo ? "Excluindo…" : "Excluir definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
