"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Exibe o Ponto Digital embutido no sistema.
 * Alguns provedores bloqueiam iframe (X-Frame-Options / CSP frame-ancestors);
 * por isso, se o quadro não carregar em poucos segundos, mostramos a alternativa.
 */
export default function PontoFrame({ url }: { url: string }) {
  const [carregou, setCarregou] = useState(false);
  const [demorou, setDemorou] = useState(false);
  const [cheio, setCheio] = useState(false);
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDemorou(true), 6000);
    return () => clearTimeout(t);
  }, []);

  // Sai da tela cheia com ESC
  useEffect(() => {
    if (!cheio) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCheio(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cheio]);

  return (
    <div className={cheio ? "ponto-wrap cheio" : "ponto-wrap"}>
      <div className="ponto-bar">
        <span className="ponto-origem mono">gestor.coalize.com.br</span>
        <span className="ponto-acoes">
          <button className="btn" onClick={() => { setCarregou(false); setDemorou(false); if (ref.current) ref.current.src = url; }}>
            ↻ Recarregar
          </button>
          <button className="btn" onClick={() => setCheio((v) => !v)}>
            {cheio ? "↙ Reduzir" : "↗ Tela cheia"}
          </button>
          <a className="btn" href={url} target="_blank" rel="noopener noreferrer">Abrir em nova aba</a>
        </span>
      </div>

      <div className="ponto-box">
        {!carregou && (
          <div className="ponto-status">
            {demorou ? (
              <>
                <strong>O Ponto Digital não abriu aqui dentro.</strong>
                <p>
                  Provavelmente o sistema de ponto não permite ser exibido dentro de outra página
                  (proteção do próprio provedor). Use o botão abaixo para registrar seu ponto.
                </p>
                <a className="btn primary" href={url} target="_blank" rel="noopener noreferrer">Abrir Ponto Digital ↗</a>
              </>
            ) : (
              <p>Carregando o Ponto Digital…</p>
            )}
          </div>
        )}
        <iframe
          ref={ref}
          src={url}
          title="Ponto Digital"
          className="ponto-iframe"
          onLoad={() => setCarregou(true)}
          allow="camera; geolocation; clipboard-write"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
}
