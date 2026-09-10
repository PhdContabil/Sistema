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
  const [voltouPraLogin, setVoltouPraLogin] = useState(false);
  const ref = useRef<HTMLIFrameElement>(null);
  const cargas = useRef<number[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDemorou(true), 8000);
    return () => clearTimeout(t);
  }, []);

  // O navegador não deixa a gente enxergar o que acontece dentro do iframe
  // (é outro domínio), mas dá pra perceber o sintoma: se o quadro recarrega
  // de novo pouco tempo depois de já ter carregado uma vez, é sinal de que o
  // login foi feito lá dentro mas o cookie de sessão foi bloqueado (cookie de
  // terceiro) e a página voltou sozinha pro formulário.
  function registrarCarga() {
    if (!carregou) {
      setCarregou(true);
      return;
    }
    const agora = Date.now();
    cargas.current = [...cargas.current, agora].filter((t) => agora - t < 20000);
    if (cargas.current.length >= 1) setVoltouPraLogin(true);
  }

  function recarregar() {
    setCarregou(false);
    setDemorou(false);
    setVoltouPraLogin(false);
    cargas.current = [];
    if (ref.current) ref.current.src = url;
  }

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
          <button className="btn" onClick={recarregar}>
            ↻ Recarregar
          </button>
          <button className="btn" onClick={() => setCheio((v) => !v)}>
            {cheio ? "↙ Reduzir (ESC)" : "↗ Tela cheia"}
          </button>
          <a className="btn" href={url} target="_blank" rel="noopener noreferrer">Abrir em nova aba ↗</a>
        </span>
      </div>

      {voltouPraLogin ? (
        <p className="ponto-aviso ponto-aviso-forte">
          <strong>Não conseguimos manter você conectado aqui dentro.</strong>{" "}
          O login foi feito, mas o navegador bloqueou o cookie de sessão do
          Ponto Digital dentro deste quadro embutido (cookie de terceiro) — não
          é algo que dá pra resolver liberando cookies nas configurações, é uma
          proteção do próprio navegador contra sites de terceiros dentro de
          outro site. Use <a href={url} target="_blank" rel="noopener noreferrer">"Abrir em nova aba ↗"</a> acima, que sempre funciona.
        </p>
      ) : (
        <p className="ponto-aviso">
          Se o login não completar aqui dentro (a tela recarrega e volta pro
          formulário), é o navegador bloqueando cookie de terceiro nesse quadro
          embutido — use "Abrir em nova aba ↗" acima, que sempre funciona.
        </p>
      )}

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
          onLoad={registrarCarga}
          allow="camera; geolocation; clipboard-write; storage-access"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
}
