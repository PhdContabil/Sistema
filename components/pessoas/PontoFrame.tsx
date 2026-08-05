"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Ponto Digital embutido. O quadro ocupa toda a altura útil da janela para
 * que a tela de login do provedor apareça inteira, sem rolagem dupla.
 */
export default function PontoFrame({ url }: { url: string }) {
  const [carregou, setCarregou] = useState(false);
  const [demorou, setDemorou] = useState(false);
  const [cheio, setCheio] = useState(false);
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDemorou(true), 8000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!cheio) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCheio(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [cheio]);

  return (
    <div className={cheio ? "ponto-page cheio" : "ponto-page"}>
      <div className="ponto-bar">
        <span className="ponto-id">
          <span className="ponto-ic">PD</span>
          <span>
            <strong>Ponto Digital</strong>
            <span className="ponto-origem">gestor.coalize.com.br</span>
          </span>
        </span>
        <span className="ponto-acoes">
          <button className="btn" onClick={() => { setCarregou(false); setDemorou(false); if (ref.current) ref.current.src = url; }}>
            ↻ Recarregar
          </button>
          <button className="btn" onClick={() => setCheio((v) => !v)}>
            {cheio ? "↙ Reduzir (ESC)" : "↗ Tela cheia"}
          </button>
          <a className="btn" href={url} target="_blank" rel="noopener noreferrer">Abrir em nova aba ↗</a>
        </span>
      </div>

      <div className="ponto-box">
        {!carregou && (
          <div className="ponto-status">
            {demorou ? (
              <>
                <strong>O Ponto Digital não abriu aqui dentro.</strong>
                <p>Use o botão abaixo para registrar seu ponto em uma nova aba.</p>
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
