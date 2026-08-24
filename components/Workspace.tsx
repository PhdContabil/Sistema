"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MODULES } from "@/lib/modules";
import ThemeToggle from "./ThemeToggle";
import UsuarioAtual from "./UsuarioAtual";

const CHAVE_MENU = "nc-menu-recolhido";

export default function Workspace({
  moduleId,
  appName,
  children,
}: {
  moduleId: string;
  appName?: string;
  children: React.ReactNode;
}) {
  const cur = MODULES.find((m) => m.id === moduleId);

  // Começa expandido e só recolhe depois de ler a preferência, para o
  // servidor e o cliente renderizarem a mesma coisa na primeira passada.
  const [recolhido, setRecolhido] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(CHAVE_MENU) === "1") setRecolhido(true);
    } catch {
      /* navegador sem storage: segue expandido */
    }
  }, []);

  function alternarMenu() {
    setRecolhido((v) => {
      const novo = !v;
      try { localStorage.setItem(CHAVE_MENU, novo ? "1" : "0"); } catch {}
      return novo;
    });
  }

  // Tela anterior = um nível acima na URL (ex.: /m/pessoas/sobre-nos/historia -> /m/pessoas/sobre-nos)
  const pathname = usePathname() ?? "";
  const partes = pathname.split("/").filter(Boolean);
  const voltarPara = partes.length > 2 ? "/" + partes.slice(0, -1).join("/") : "/";

  return (
    <div className={`workspace ${recolhido ? "menu-recolhido" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <Link href="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="brand-mark">N</span>
            <span className="brand-txt">
              <span className="brand-name" style={{ display: "block" }}>Núcleo Contábil</span>
              <span className="brand-sub mono">Escritório</span>
            </span>
          </Link>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-label mono">Módulos</div>
          {MODULES.map((m) => {
            const active = m.id === moduleId;
            return (
              <Link
                key={m.id}
                href={`/m/${m.id}`}
                prefetch={false}
                className={`rail ${active ? "active" : ""}`}
                title={recolhido ? m.name : undefined}
              >
                {active && <span className="bar" />}
                <span className="ic mono" style={{ background: m.color }}>{m.initials}</span>
                <span className="nm">{m.name}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <ThemeToggle full />
          <UsuarioAtual />
        </div>
      </aside>

      <div className="main">
        <div className="main-top">
          <div className="top-esq">
            <button
              className="btn-menu"
              onClick={alternarMenu}
              aria-label={recolhido ? "Exibir menu lateral" : "Ocultar menu lateral"}
              aria-expanded={!recolhido}
              title={recolhido ? "Exibir menu" : "Ocultar menu"}
            >
              <span /><span /><span />
            </button>
            <Link className="btn-voltar" href={voltarPara} aria-label="Voltar para a tela anterior">
              ← Voltar
            </Link>
            <div className="crumb mono">
              <Link href="/">Módulos</Link> / <span className={appName ? "" : "cur"}>{cur?.name ?? moduleId}</span>
              {appName && <> / <span className="cur">{appName}</span></>}
            </div>
          </div>
        </div>
        <div className="main-body">{children}</div>
      </div>
    </div>
  );
}
