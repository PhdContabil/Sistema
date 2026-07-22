"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface SyncResult {
  ok: boolean;
  fetched?: number;
  inserted?: number;
  updated?: number;
  activities?: number;
  durationMs?: number;
  errors?: string[];
  error?: string;
}

interface Props {
  /**
   * Quantas janelas de 30 dias varrer. Default 2 (≈60 dias).
   * 1 é o mais rápido (~20s); 2 cobre bem o mês corrente + anterior.
   */
  windows?: number;
}

export function SyncButton({ windows = 2 }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [, startTransition] = useTransition();

  async function handleSync() {
    if (loading) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch(
        `/api/societario/cron/sync-tareffa?windows=${windows}`,
        { method: "POST", cache: "no-store" }
      );
      const data = (await r.json()) as SyncResult;
      setResult(data);
      // Se algo foi atualizado, recarrega os dados do server component.
      if (data.ok || (data.fetched ?? 0) > 0) {
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setResult({
        ok: false,
        error: (e as Error).message || "Falha de rede",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleSync}
        disabled={loading}
        className="bg-brand-700 hover:bg-brand-900 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded px-4 py-2 flex items-center gap-2"
      >
        {loading ? (
          <>
            <svg
              className="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
            >
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
            Atualizando...
          </>
        ) : (
          <>↻ Atualizar dados</>
        )}
      </button>

      {result && (
        <div
          className={`text-xs rounded px-3 py-1.5 max-w-xs text-right ${
            result.ok
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {result.ok ? (
            <>
              ✓ {result.fetched ?? 0} processos · {result.inserted ?? 0} novos ·{" "}
              {result.updated ?? 0} atualizados · {result.activities ?? 0}{" "}
              atividades
              {typeof result.durationMs === "number" && (
                <span className="text-green-600">
                  {" "}
                  ({(result.durationMs / 1000).toFixed(1)}s)
                </span>
              )}
            </>
          ) : (
            <>
              ✗ {result.error || result.errors?.[0] || "Falha ao sincronizar"}
            </>
          )}
        </div>
      )}
    </div>
  );
}
