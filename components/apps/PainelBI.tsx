"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Faz o relatório preencher a largura do quadro.
 *
 * Sem isso o Power BI encaixa a página inteira no espaço disponível e sobra
 * tarja preta dos dois lados, porque a proporção do relatório raramente bate
 * com a da janela. Com `fitToWidth` ele usa toda a largura e, se precisar,
 * rola na vertical — que é o sentido natural de leitura.
 */
function preencherLargura(url: string): string {
  if (/[?&]pageView=/.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "pageView=fitToWidth";
}

/**
 * Painel do Power BI embutido.
 *
 * Reaproveita o formato do Ponto Digital — quadro ocupando a altura útil,
 * tela cheia e link para abrir fora —, mas sem o alerta de cookie de terceiro:
 * um link "publicar na web" do Power BI é anônimo, não depende de sessão, então
 * aquele aviso só assustaria à toa.
 */
export default function PainelBI({
  url,
  titulo,
  origem = "app.powerbi.com",
}: {
  url: string;
  titulo: string;
  origem?: string;
}) {
  const src = preencherLargura(url);
  const [carregou, setCarregou] = useState(false);
  const [demorou, setDemorou] = useState(false);
  const [cheio, setCheio] = useState(false);
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDemorou(true), 10000);
    return () => clearTimeout(t);
  }, []);

  function recarregar() {
    setCarregou(false);
    setDemorou(false);
    if (ref.current) ref.current.src = src;
  }

  useEffect(() => {
    if (!cheio) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCheio(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [cheio]);

  return (
    <div className={cheio ? "ponto-page bi-page cheio" : "ponto-page bi-page"}>
      <div className="ponto-bar">
        <span className="ponto-id">
          <span className="ponto-ic">BI</span>
          <span>
            <strong>{titulo}</strong>
            <span className="ponto-origem">{origem}</span>
          </span>
        </span>
        <span className="ponto-acoes">
          <button className="btn" onClick={recarregar}>↻ Recarregar</button>
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
                <strong>O painel não abriu aqui dentro.</strong>
                <p>Abra em uma nova aba — o conteúdo é o mesmo.</p>
                <a className="btn primary" href={url} target="_blank" rel="noopener noreferrer">
                  Abrir {titulo} ↗
                </a>
              </>
            ) : (
              <p>Carregando o painel…</p>
            )}
          </div>
        )}
        <iframe
          ref={ref}
          src={src}
          title={titulo}
          className="ponto-iframe"
          onLoad={() => setCarregou(true)}
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
}
