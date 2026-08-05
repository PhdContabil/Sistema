"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/societario/supabase-browser";

export default function BotaoEntrar({ next }: { next: string }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar() {
    setCarregando(true);
    setErro(null);
    const sb = createSupabaseBrowserClient();
    // Usa o callback já autorizado no Supabase (o mesmo do Societário).
    // A validação de domínio é feita no middleware, para qualquer entrada.
    const { error } = await sb.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "openid email profile",
        redirectTo: `${window.location.origin}/m/societario/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setErro(error.message);
      setCarregando(false);
    }
  }

  return (
    <>
      <button className="btn-microsoft" onClick={entrar} disabled={carregando}>
        <LogoMicrosoft />
        {carregando ? "Redirecionando…" : "Entrar com Microsoft 365"}
      </button>
      {erro && <p className="login-erro">{erro}</p>}
    </>
  );
}

function LogoMicrosoft() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}
