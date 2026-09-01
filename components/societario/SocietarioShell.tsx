"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const CHAVE_TEMA = "soc-tema";
const CHAVE_MENU = "soc-menu-recolhido";

// Ícones de traço fino (mesmo estilo dos demais ícones do Núcleo:
// stroke=currentColor, sem preenchimento) para o menu do Societário.
function IconeGrade() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconePasta() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}
function IconeMais() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}
function IconePredio() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v15M12 21v-9a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v9" />
      <path d="M4 21h16M7 8h1M7 12h1M7 16h1" />
    </svg>
  );
}
function IconeEtiqueta() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2H4a2 2 0 0 0-2 2v8l10.6 10.6a2 2 0 0 0 2.83 0l7.17-7.17a2 2 0 0 0 0-2.83z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  );
}
function IconeUsuarios() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <circle cx="17.5" cy="8.5" r="2.6" />
      <path d="M14.8 12.3a5.4 5.4 0 0 1 6.7 5.2" />
    </svg>
  );
}
function IconeVoltar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 6 6v1" />
    </svg>
  );
}

function IconeCaret({ direita }: { direita?: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: direita ? "rotate(180deg)" : undefined }}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconeLua() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function IconeSol() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

export default function SocietarioShell({
  admin,
  userEmail,
  roleLabel,
  versao,
  children,
}: {
  admin: boolean;
  userEmail: string;
  roleLabel: string;
  versao: string;
  children: React.ReactNode;
}) {
  const [escuro, setEscuro] = useState(false);
  const [recolhido, setRecolhido] = useState(false);
  const pathname = usePathname() ?? "";

  useEffect(() => {
    try {
      if (localStorage.getItem(CHAVE_TEMA) === "dark") setEscuro(true);
      if (localStorage.getItem(CHAVE_MENU) === "1") setRecolhido(true);
    } catch {
      /* navegador sem storage: segue claro/expandido */
    }
  }, []);

  function alternarTema() {
    setEscuro((v) => {
      const novo = !v;
      try { localStorage.setItem(CHAVE_TEMA, novo ? "dark" : "light"); } catch {}
      return novo;
    });
  }

  function alternarMenu() {
    setRecolhido((v) => {
      const novo = !v;
      try { localStorage.setItem(CHAVE_MENU, novo ? "1" : "0"); } catch {}
      return novo;
    });
  }

  return (
    <div
      className="min-h-screen societario-scope flex"
      data-theme={escuro ? "dark" : "light"}
    >
      <aside className={`soc-side soc-sidebar flex flex-col ${recolhido ? "collapsed" : ""}`}>
        <div className="px-4 py-5 text-left">
          <div className="soc-serif text-lg font-bold tracking-tight">Societário</div>
          <div className="text-[11px] soc-muted">PhD Contábil</div>
          <div className="text-[9px] soc-muted mt-1">v{versao}</div>
        </div>

        <nav className="flex-1 px-2 py-1 space-y-0.5 text-sm overflow-y-auto">
          <NavLink href="/m/societario" pathname={pathname} icon={<IconeGrade />} exact>
            Dashboard
          </NavLink>
          <NavLink href="/m/societario/processos" pathname={pathname} icon={<IconePasta />}>
            Processos
          </NavLink>
          {admin && (
            <NavLink href="/m/societario/processos/novo" pathname={pathname} icon={<IconeMais />}>
              Novo processo
            </NavLink>
          )}
          <NavLink href="/m/societario/empresas" pathname={pathname} icon={<IconePredio />}>
            Empresas
          </NavLink>
          {admin && (
            <>
              <div className="px-3 pt-4 pb-1 text-[10px] soc-muted uppercase tracking-wider">
                Cadastros
              </div>
              <NavLink href="/m/societario/tipos-processo" pathname={pathname} icon={<IconeEtiqueta />}>
                Tipos de processo
              </NavLink>
              <div className="px-3 pt-4 pb-1 text-[10px] soc-muted uppercase tracking-wider">
                Administração
              </div>
              <NavLink href="/m/societario/admin/usuarios" pathname={pathname} icon={<IconeUsuarios />}>
                Usuários
              </NavLink>
            </>
          )}
          <div className="px-3 pt-4 pb-1 text-[10px] soc-muted uppercase tracking-wider">
            Núcleo Contábil
          </div>
          <NavLink href="/" pathname={pathname} icon={<IconeVoltar />} neverActive>
            Voltar ao painel
          </NavLink>
        </nav>

        <div className="px-4 py-3 soc-sidebar-foot">
          <button type="button" className="soc-theme-btn" onClick={alternarTema}>
            {escuro ? <IconeSol /> : <IconeLua />}
            {escuro ? "Modo claro" : "Modo escuro"}
          </button>
          <div className="text-[10px] soc-muted truncate">{userEmail}</div>
          <div className="text-[9px] soc-muted mb-1">{roleLabel}</div>
          <form action="/m/societario/auth/signout" method="post">
            <button
              type="submit"
              className="text-[11px] soc-muted hover:underline underline-offset-2"
            >
              Sair
            </button>
          </form>
        </div>
      </aside>

      <button
        type="button"
        className="soc-side-toggle"
        onClick={alternarMenu}
        aria-label={recolhido ? "Exibir menu lateral" : "Ocultar menu lateral"}
        title={recolhido ? "Exibir menu" : "Ocultar menu"}
      >
        <IconeCaret direita={recolhido} />
      </button>

      <main className="soc-main px-8 py-6 overflow-x-auto min-h-screen">
        {children}
      </main>
    </div>
  );
}

function NavLink({
  href,
  pathname,
  icon,
  exact,
  neverActive,
  children,
}: {
  href: string;
  pathname: string;
  icon: React.ReactNode;
  exact?: boolean;
  neverActive?: boolean;
  children: React.ReactNode;
}) {
  const active =
    !neverActive && (exact ? pathname === href : pathname.startsWith(href));
  return (
    <Link
      href={href}
      className={`soc-nav-link flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition ${
        active ? "soc-nav-link-active" : ""
      }`}
    >
      <span className="flex-none opacity-80">{icon}</span>
      {children}
    </Link>
  );
}
