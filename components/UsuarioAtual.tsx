"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/societario/supabase-browser";

interface Dados { nome: string; email: string; iniciais: string; }

function iniciaisDe(nome: string, email: string) {
  const base = (nome || email.split("@")[0] || "").replace(/\|.*$/, "").trim();
  const w = base.split(/[\s.]+/).filter(Boolean);
  return ((w[0]?.[0] || "") + (w[1]?.[0] || "")).toUpperCase() || "??";
}

export function useUsuario(): Dados | null {
  const [u, setU] = useState<Dados | null>(null);
  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    sb.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user?.email) return;

      // Se o e-mail está vinculado a um cadastro em Pessoas, o nome de lá
      // manda — é o caso de contas de setor/compartilhadas (ex.: o e-mail
      // "tecnologia" logado por uma pessoa específica), onde o nome da conta
      // Microsoft não é quem realmente está usando o sistema.
      const { data: perfil } = await sb
        .from("pessoas_perfil")
        .select("nome")
        .ilike("email", user.email)
        .maybeSingle();

      const nome =
        (perfil?.nome as string) ||
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        user.email.split("@")[0];
      const limpo = String(nome).replace(/\s*\|.*$/, "").trim();
      setU({ nome: limpo, email: user.email, iniciais: iniciaisDe(limpo, user.email) });
    });
  }, []);
  return u;
}

/** Bloco de usuário da sidebar (com sair). */
export default function UsuarioAtual() {
  const u = useUsuario();
  return (
    <div className="user-row">
      <span className="avatar mono">{u?.iniciais ?? "··"}</span>
      <span className="quem" style={{ minWidth: 0, flex: 1 }}>
        <span className="nm" style={{ display: "block" }}>{u?.nome ?? "Carregando…"}</span>
        <span className="role" title={u?.email}>{u?.email ?? ""}</span>
      </span>
      <a className="sair" href="/auth/sair" title="Sair do sistema" aria-label="Sair">⏻</a>
    </div>
  );
}

/** Avatar compacto do topo (launcher) — leva direto ao perfil que a pessoa personaliza em Pessoas. */
export function AvatarUsuario() {
  const u = useUsuario();
  return (
    <span className="avatar-wrap">
      <Link href="/m/pessoas/meu-perfil" className="avatar mono" title={u ? `${u.nome} — abrir meu perfil` : "Meu perfil"}>
        {u?.iniciais ?? "··"}
      </Link>
      <a className="sair" href="/auth/sair" title="Sair do sistema" aria-label="Sair">⏻</a>
    </span>
  );
}
