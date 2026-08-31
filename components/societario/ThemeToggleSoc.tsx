"use client";

import { useEffect, useState } from "react";

/**
 * Alterna o mesmo data-theme do resto do Núcleo Contábil (persistido em
 * localStorage como "nc-tema") — o Societário não tinha alternância própria
 * e ficava sempre no visual claro, mesmo com o dark mode ligado no hub.
 */
export default function ThemeToggleSoc() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  function alternar() {
    const proximo = dark ? "light" : "dark";
    document.documentElement.dataset.theme = proximo;
    try {
      localStorage.setItem("nc-tema", proximo);
    } catch {}
    setDark(!dark);
  }

  return (
    <button
      type="button"
      onClick={alternar}
      className="w-full flex items-center gap-2 text-[11px] text-white/70 hover:text-white border border-white/15 hover:border-white/30 rounded px-2 py-1.5 transition mb-2"
    >
      <span
        className="inline-block w-2.5 h-2.5 rounded-full border border-current shrink-0"
        style={{ background: dark ? "transparent" : "currentColor" }}
      />
      {dark ? "Modo claro" : "Modo escuro"}
    </button>
  );
}
