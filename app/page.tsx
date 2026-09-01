"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MODULES } from "@/lib/modules";
import ThemeToggle from "@/components/ThemeToggle";
import { AvatarUsuario, useUsuario } from "@/components/UsuarioAtual";
import ModuloIcon, { IconePonto, IconeEmpresas } from "@/components/ModuloIcon";

export default function Launcher() {
  const usuario = useUsuario();
  const [busca, setBusca] = useState("");
  const [bloqueados, setBloqueados] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/acesso", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setBloqueados(j.bloqueados ?? []))
      .catch(() => {});
  }, []);
  const q = busca.trim().toLowerCase();
  const mods = MODULES.filter(
    (m) => !q || m.name.toLowerCase().includes(q) || m.apps.some((a) => a.name.toLowerCase().includes(q))
  );

  return (
    <div className="launcher">
      <div className="topbar">
        <div className="brand">
          <span className="brand-mark">N</span>
          <span>
            <span className="brand-name" style={{ display: "block" }}>Núcleo Contábil</span>
            <span className="brand-sub mono">Painel do escritório</span>
          </span>
        </div>
        <div className="topbar-right">
          <label className="searchbox">
            <span className="ring" />
            <input placeholder="Buscar aplicação…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <ThemeToggle />
          <AvatarUsuario />
        </div>
      </div>

      <div className="launcher-body">
        <div className="launcher-inner">
          <div className="eyebrow mono">Bem-vindo{usuario ? `, ${usuario.nome.split(" ")[0]}` : ""}</div>
          <h1>Escolha um módulo</h1>
          <p className="lead">Selecione uma área para acessar suas aplicações.</p>

          <div className="destaques">
            <Link className="destaque" href="/m/pessoas/ponto">
              <span className="destaque-ic">
                <IconePonto />
              </span>
              <span className="destaque-txt">
                <span className="destaque-nome">Ponto Digital</span>
                <span className="destaque-desc">Registre seu ponto pelo computador, sem sair do sistema.</span>
              </span>
              <span className="destaque-go mono">ABRIR ›</span>
            </Link>

            <Link className="destaque" href="/m/empresas">
              <span className="destaque-ic">
                <IconeEmpresas />
              </span>
              <span className="destaque-txt">
                <span className="destaque-nome">Empresas</span>
                <span className="destaque-desc">Ache a pasta de qualquer empresa no SharePoint.</span>
              </span>
              <span className="destaque-go mono">ABRIR ›</span>
            </Link>
          </div>

          <div className="module-grid">
            {mods.map((m) => {
              const prontos = m.apps.filter((a) => a.href).length;
              const semAcesso = bloqueados.includes(m.id);
              return (
                <Link key={m.id} href={`/m/${m.id}`} className="module-card">
                  <div className="row">
                    <span className="module-ic" style={{ background: m.color }}>
                      <ModuloIcon id={m.id} />
                    </span>
                    <span className="count mono" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      {semAcesso && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label="Acesso restrito" style={{ opacity: 0.55 }}>
                          <rect x="5" y="11" width="14" height="9" rx="2" />
                          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                        </svg>
                      )}
                      {m.apps.length} apps{prontos ? ` · ${prontos} ativo${prontos > 1 ? "s" : ""}` : ""}
                    </span>
                  </div>
                  <div>
                    <div className="name">{m.name}</div>
                    <div className="desc">{m.desc}</div>
                  </div>
                  <div className="cta mono">Abrir módulo →</div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
