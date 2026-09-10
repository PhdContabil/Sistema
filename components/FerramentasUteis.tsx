"use client";

import { useEffect, useRef, useState } from "react";

// Atalhos pros sites externos que a equipe usa direto — pedido do Pedro pra
// ficar tudo num clique, sem precisar ir catando link salvo/favorito.
// Pra adicionar ou trocar um site, só mexer nessa lista. `icone` é um PNG
// próprio em /public/ferramentas (recortado/tratado a partir do logo de cada
// site); sem `icone`, cai no favicon do próprio site como alternativa.
const FERRAMENTAS = [
  { nome: "Digisac", url: "https://phdcontabil.digisac.app/", icone: "/ferramentas/digisac.png" },
  {
    nome: "Questor Zen",
    url: "https://phd.app.questorpublico.com.br/Authorize/LogOn?ReturnUrl=%2fcliente%2fdocumentos%3fStatus%3dPending%26Received%3dDocument.PayRoll&Status=Pending&Received=Document.PayRoll",
    icone: "/ferramentas/questorzen.png",
  },
  { nome: "Econet", url: "https://www.econeteditora.com.br/" },
  { nome: "Veri", url: "https://veri.bewmarketingdigital.com.br/login", icone: "/ferramentas/veri.png" },
];

function iconeFavicon(url: string): string {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    /* url inválida, ícone genérico */
  }
  return `https://www.google.com/s2/favicons?sz=64&domain=${host}`;
}

export default function FerramentasUteis() {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fecharFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    function fecharEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", fecharFora);
    document.addEventListener("keydown", fecharEsc);
    return () => {
      document.removeEventListener("mousedown", fecharFora);
      document.removeEventListener("keydown", fecharEsc);
    };
  }, []);

  return (
    <div className="ferramentas" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setAberto((v) => !v)}
        aria-label="Ferramentas úteis"
        aria-expanded={aberto}
        title="Ferramentas úteis"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      </button>

      {aberto && (
        <div className="ferramentas-menu">
          <div className="ferramentas-titulo mono">Ferramentas úteis</div>
          {FERRAMENTAS.map((f) => (
            <a
              key={f.nome}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ferramenta-item"
              onClick={() => setAberto(false)}
            >
              <span className="ferramenta-ic">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.icone ?? iconeFavicon(f.url)} alt="" width={18} height={18} />
              </span>
              <span className="ferramenta-nome">{f.nome}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
