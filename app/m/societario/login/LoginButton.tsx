"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/societario/supabase-browser";

export function LoginButton({ nextPath }: { nextPath: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();
    const origin = window.location.origin;
    const { error } = await sb.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "openid email profile",
        redirectTo: `${origin}/m/societario/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={signIn}
        disabled={loading}
        className="w-full bg-[#2f2f2f] hover:bg-black text-white rounded-lg py-2.5 px-4 flex items-center justify-center gap-3 font-medium disabled:opacity-50 transition"
      >
        <MicrosoftLogo />
        {loading ? "Redirecionando..." : "Entrar com Microsoft 365"}
      </button>
      {error && (
        <p className="mt-3 text-sm text-red-600 text-center">{error}</p>
      )}
    </div>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}
