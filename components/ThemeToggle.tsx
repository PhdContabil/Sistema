"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle({ full = false }: { full?: boolean }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("nc-tema", next); } catch {}
    setDark(!dark);
  }

  const label = dark ? "Modo claro" : "Modo escuro";
  return (
    <button className="icon-btn" onClick={toggle} style={full ? { width: "100%" } : undefined} aria-label={label}>
      <span className="theme-dot" />
      <span className="rotulo">{label}</span>
    </button>
  );
}
