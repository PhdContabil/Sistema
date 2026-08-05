"use client";

import { useEffect, useMemo, useState } from "react";
import type { Perfil } from "@/lib/pessoas/dados";
import PerfilPainel from "./PerfilPainel";

function iniciais(nome: string) {
  const w = nome.replace(/^(Sra?\.)\s*/i, "").trim().split(/\s+/);
  return ((w[0]?.[0] || "") + (w[1]?.[0] || "")).toUpperCase();
}

export default function ListaPessoas({ pessoas }: { pessoas: Perfil[] }) {
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [presenca, setPresenca] = useState<Record<string, string>>({});

  // Presença do Teams (Microsoft Graph) — atualiza a cada 60s.
  useEffect(() => {
    const emails = pessoas.map((p) => p.email).filter(Boolean) as string[];
    if (emails.length === 0) return;
    let vivo = true;
    const buscar = () =>
      fetch("/api/pessoas/presenca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      })
        .then((r) => r.json())
        .then((j) => { if (vivo && j?.presenca) setPresenca(j.presenca); })
        .catch(() => {});
    buscar();
    const t = setInterval(buscar, 60000);
    return () => { vivo = false; clearInterval(t); };
  }, [pessoas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return pessoas;
    return pessoas.filter(
      (p) => p.nome.toLowerCase().includes(q) || (p.funcao ?? "").toLowerCase().includes(q) || p.setor.toLowerCase().includes(q)
    );
  }, [pessoas, busca]);

  const selecionada = filtradas.find((p) => p.slug === sel) ?? null;

  function statusDe(p: Perfil): string | null {
    if (!p.email) return null;
    return presenca[p.email.toLowerCase()] ?? null;
  }

  return (
    <>
      <div className="toolbar">
        <input className="search" placeholder="Buscar por nome, função ou setor…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <span className="chip on">{filtradas.length} pessoas</span>
      </div>

      <div className="pessoas-layout">
        {/* Coluna esquerda: lista rolável */}
        <aside className="pessoas-lista">
          {filtradas.map((p) => {
            const st = statusDe(p);
            return (
              <button
                key={p.slug}
                className={`linha-pessoa${sel === p.slug ? " ativa" : ""}`}
                onClick={() => setSel(p.slug)}
              >
                <span className="lp-foto">
                  {p.foto_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.foto_url} alt={p.nome} />
                    : <span className="lp-ini mono">{iniciais(p.nome)}</span>}
                  {st && <span className={`presenca ${st}`} title={rotuloPresenca(st)} />}
                </span>
                <span className="lp-txt">
                  <span className="lp-nome">
                    {p.nome}
                    {p.modelo && <span className="lp-modelo mono">modelo</span>}
                  </span>
                  <span className="lp-cargo">{p.setor} — {p.funcao ?? p.cargo ?? ""}</span>
                </span>
              </button>
            );
          })}
          {filtradas.length === 0 && <div className="loading">Nenhuma pessoa encontrada.</div>}
        </aside>

        {/* Coluna direita: perfil fixo */}
        <div className="pessoas-detalhe">
          {selecionada ? (
            <PerfilPainel slug={selecionada.slug} onFechar={() => setSel(null)} />
          ) : (
            <div className="detalhe-vazio">
              <div className="dv-ic">👥</div>
              <p><strong>Selecione uma pessoa</strong></p>
              <p className="dv-sub">Clique em um nome na lista para ver o perfil completo aqui.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function rotuloPresenca(s: string) {
  const m: Record<string, string> = {
    available: "Disponível", busy: "Ocupado", donotdisturb: "Não incomodar",
    away: "Ausente", berightback: "Volto logo", offline: "Offline", unknown: "Indisponível",
  };
  return m[s] ?? s;
}
