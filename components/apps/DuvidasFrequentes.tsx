"use client";
import { useState } from "react";
import type { Duvida } from "@/lib/tecnologia/duvidas";

const svg = (c: React.ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{c}</svg>
);
const ICONES: Record<string, React.ReactNode> = {
  "pc-lento": svg(<><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /><path d="M12 7v4l2 1" /></>),
  "internet-lenta": svg(<><path d="M5 12.5a10 10 0 0 1 14 0" /><path d="M8.5 16a5 5 0 0 1 7 0" /><path d="M2 9a15 15 0 0 1 20 0" /><circle cx="12" cy="19.5" r="1" /></>),
  padrao: svg(<><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>),
};

export default function DuvidasFrequentes({ duvidas, cor }: { duvidas: Duvida[]; cor: string }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const d = duvidas.find((x) => x.id === aberta);

  if (d) {
    return (
      <div style={{ marginTop: 18, maxWidth: 820 }}>
        <button onClick={() => setAberta(null)} className="btn-voltar" style={{ background: "none", border: 0, color: cor, cursor: "pointer", padding: 0, marginBottom: 12 }}>
          ← Todas as dúvidas
        </button>
        <div className="painel-api" style={{ padding: 22 }}>
          <h2 style={{ margin: "0 0 6px" }}>{d.titulo}</h2>
          <p style={{ margin: "0 0 14px", opacity: 0.8 }}><b>Quando acontece:</b> {d.sintomas}</p>
          <div style={{ borderLeft: `3px solid ${cor}`, padding: "8px 12px", marginBottom: 18, lineHeight: 1.5 }}>
            <b>Por que acontece?</b><br />{d.porque}
          </div>
          <h3 style={{ margin: "0 0 10px" }}>Passo a passo</h3>
          <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {d.passos.map((p, i) => (
              <li key={i} style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <span style={{ flex: "0 0 26px", height: 26, borderRadius: 13, background: cor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>{i + 1}</span>
                <div style={{ lineHeight: 1.45 }}>
                  <div>{p.texto}</div>
                  {p.detalhe && <div style={{ fontSize: 13, opacity: 0.7 }}>{p.detalhe}</div>}
                  {p.imagem && (
                    <a href={p.imagem} target="_blank" rel="noopener noreferrer" title="Abrir em tamanho real">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.imagem} alt={p.texto} loading="lazy"
                        style={{ display: "block", marginTop: 8, maxWidth: "100%", maxHeight: 360, borderRadius: 8, border: "1px solid rgba(127,127,127,.3)" }} />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {d.link && (
            <a href={d.link.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 6, background: cor, color: "#fff", padding: "10px 16px", borderRadius: 8, fontWeight: 600, textDecoration: "none" }}>
              {d.link.rotulo} ↗
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-grid" style={{ marginTop: 18 }}>
      {duvidas.map((x) => (
        <button key={x.id} onClick={() => setAberta(x.id)} className="app-card on"
          style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", ["--card-accent" as string]: cor }}>
          <div className="app-ic-sm" style={{ color: cor }}>{ICONES[x.id] ?? ICONES.padrao}</div>
          <div className="nm">{x.titulo}</div>
          <div className="desc">{x.sintomas}</div>
          <div className="go mono">VER SOLUÇÃO ›</div>
        </button>
      ))}
    </div>
  );
}
