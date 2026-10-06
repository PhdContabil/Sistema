"use client";

// Detecta deploy novo e atualiza a página. Para não perder formulário em
// edição: se a aba estiver em segundo plano, recarrega sozinho quando a pessoa
// voltar; se estiver em uso, mostra um aviso com o botão "Atualizar agora".
import { useEffect, useRef, useState } from "react";

export default function VersaoWatcher() {
  const base = useRef<string | null>(null);
  const [novaVersao, setNovaVersao] = useState(false);

  useEffect(() => {
    let ativo = true;
    async function checar(): Promise<boolean> {
      try {
        const r = await fetch("/api/versao", { cache: "no-store" });
        if (!r.ok) return false;
        const { versao } = (await r.json()) as { versao?: string };
        if (!versao) return false;
        if (base.current === null) { base.current = versao; return false; }
        return versao !== base.current;
      } catch {
        return false;
      }
    }
    checar();
    const id = setInterval(async () => {
      if (ativo && (await checar())) setNovaVersao(true);
    }, 60_000);
    async function aoVoltar() {
      if (document.visibilityState === "visible" && (await checar())) window.location.reload();
    }
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { ativo = false; clearInterval(id); document.removeEventListener("visibilitychange", aoVoltar); };
  }, []);

  if (!novaVersao) return null;
  return (
    <div style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#123a73", color: "#fff", padding: "10px 16px", borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,.25)", display: "flex", gap: 12, alignItems: "center", fontSize: 14 }}>
      <span>Saiu uma atualização do sistema.</span>
      <button onClick={() => window.location.reload()} style={{ background: "#fff", color: "#123a73", border: 0, borderRadius: 6, padding: "6px 12px", fontWeight: 600, cursor: "pointer" }}>Atualizar agora</button>
    </div>
  );
}
