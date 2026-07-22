"use client";

// Roda o sync automaticamente ao abrir o site.
//
// Estratégia: uma vez por SESSÃO da aba do navegador (sessionStorage).
// - Abrir nova aba / nova janela / entrar de novo depois de fechar → sincroniza
// - Dar F5 na mesma aba → NÃO sincroniza de novo (evita rodar 10x quando a
//   pessoa navega entre páginas do sistema)
// - Fechar aba e reabrir → sincroniza (sessionStorage foi limpo)
//
// Não bloqueia a UI: mostra um pill discreto no canto e faz router.refresh()
// quando termina para os dados aparecerem sem F5.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "societario:autoSyncRan";

export function AutoSync() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">(
    "idle"
  );
  const [stats, setStats] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // Se já rodou nessa sessão de aba, não roda de novo
        if (sessionStorage.getItem(STORAGE_KEY) === "1") return;
        // Marca ANTES de chamar pra evitar 2 syncs paralelos
        sessionStorage.setItem(STORAGE_KEY, "1");

        setStatus("running");
        const r = await fetch("/api/societario/cron/sync-tareffa?windows=1", {
          method: "POST",
          cache: "no-store",
        });
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;

        if (r.ok && data?.ok) {
          setStatus("done");
          setStats(
            `${data.fetched ?? 0} processos · ${data.inserted ?? 0} novos · ${
              data.updated ?? 0
            } atualizados`
          );
          router.refresh();
        } else {
          // Erro: libera pra tentar de novo no próximo mount
          sessionStorage.removeItem(STORAGE_KEY);
          setStatus("error");
          setStats(
            data?.error || data?.errors?.[0] || "Falha ao atualizar"
          );
        }

        // Some com o pill depois de 4s
        setTimeout(() => {
          if (!cancelled) setStatus("idle");
        }, 4000);
      } catch {
        if (cancelled) return;
        sessionStorage.removeItem(STORAGE_KEY);
        setStatus("error");
        setStats("Falha de rede");
        setTimeout(() => {
          if (!cancelled) setStatus("idle");
        }, 4000);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "idle") return null;

  const isError = status === "error";
  const isRunning = status === "running";
  const bg = isError
    ? "bg-red-50 border-red-200 text-red-700"
    : isRunning
    ? "bg-blue-50 border-blue-200 text-blue-700"
    : "bg-green-50 border-green-200 text-green-700";

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 text-xs rounded-lg border px-3 py-2 shadow-sm flex items-center gap-2 ${bg}`}
    >
      {isRunning && (
        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
            className="opacity-25"
          />
          <path
            d="M4 12a8 8 0 018-8"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )}
      <span>
        {isRunning && "Atualizando dados..."}
        {status === "done" && `✓ Atualizado · ${stats}`}
        {isError && `✗ ${stats}`}
      </span>
    </div>
  );
}
