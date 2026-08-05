"use client";

import Link from "next/link";
import { useState } from "react";
import { MODULES } from "@/lib/modules";
import ThemeToggle from "@/components/ThemeToggle";
import { AvatarUsuario, useUsuario } from "@/components/UsuarioAtual";

export default function Launcher() {
  const usuario = useUsuario();
  const [busca, setBusca] = useState("");
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

          <Link className="destaque" href="/m/pessoas/ponto">
            <span className="destaque-ic mono">PD</span>
            <span className="destaque-txt">
              <span className="destaque-nome">Ponto Digital</span>
              <span className="destaque-desc">Registre seu ponto pelo computador, sem sair do sistema.</span>
            </span>
            <span className="destaque-go mono">ABRIR ›</span>
          </Link>

          <div className="module-grid">
            {mods.map((m) => {
              const prontos = m.apps.filter((a) => a.href).length;
              return (
                <Link key={m.id} href={`/m/${m.id}`} className="module-card">
                  <div className="row">
                    <span className="module-ic mono" style={{ background: m.color }}>{m.initials}</span>
                    <span className="count mono">
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
