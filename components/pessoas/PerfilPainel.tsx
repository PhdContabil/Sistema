"use client";

import { useEffect, useState } from "react";
import type { Perfil } from "@/lib/pessoas/dados";

function iniciais(nome: string) {
  const w = nome.replace(/^(Sra?\.)\s*/i, "").trim().split(/\s+/);
  return ((w[0]?.[0] || "") + (w[1]?.[0] || "")).toUpperCase();
}
function periodo(f: { inicio: number | null; fim: number | null }) {
  if (f.inicio && f.fim) return `${f.inicio}–${f.fim}`;
  if (f.inicio) return `${f.inicio}–atual`;
  return "";
}
function compBR(iso: string | null) {
  if (!iso) return "";
  const [a, m] = iso.split("-");
  return `${m}/${a}`;
}

export default function PerfilPainel({ slug, onFechar }: { slug: string; onFechar: () => void }) {
  const [p, setP] = useState<Perfil | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [podeEditar, setPodeEditar] = useState(false);

  useEffect(() => {
    let vivo = true;
    setP(null); setErro(null);
    fetch(`/api/pessoas/${slug}`, { cache: "no-store", credentials: "same-origin" })
      .then(async (r) => {
        const tipo = r.headers.get("content-type") ?? "";
        if (!tipo.includes("application/json")) {
          // Provavelmente redirecionado para o login (sessão expirada).
          throw new Error("Sua sessão expirou. Recarregue a página e entre novamente.");
        }
        const j = await r.json();
        if (!r.ok || j.error) throw new Error(j.error || `Erro ${r.status} ao carregar o perfil.`);
        return j;
      })
      .then((j) => { if (!vivo) return; setP(j.perfil); setPodeEditar(Boolean(j.podeEditar)); })
      .catch((e) => vivo && setErro(e instanceof Error ? e.message : "Não foi possível carregar o perfil."));
    return () => { vivo = false; };
  }, [slug]);

  return (
    <section className="perfil">
      <button className="perfil-fechar" onClick={onFechar} aria-label="Fechar">✕</button>

      {!p && !erro && <div className="loading">Carregando perfil…</div>}
      {erro && <div className="banner error">{erro}</div>}

      {p && (
        <>
          <header className="perfil-head">
            <span className="perfil-foto">
              {p.foto_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.foto_url} alt={p.nome} />
                : <span className="mono">{iniciais(p.nome)}</span>}
            </span>
            <div className="perfil-id">
              <h2>{p.nome}</h2>
              {p.tratamento && <div className="perfil-trat">Como gosta de ser chamado: <strong>{p.tratamento}</strong></div>}
              <div className="perfil-cargo">{p.cargo ?? `${p.setor} — ${p.funcao ?? ""}`}</div>
              {p.modelo && <span className="perfil-badge mono">perfil modelo</span>}
            </div>
            <div className="perfil-acoes">
              {podeEditar
                ? <a className="btn primary" href={`/m/pessoas/perfil/${p.slug}/editar`}>Editar meu perfil</a>
                : <span className="perfil-dica">Entre com seu e-mail PHD para editar o seu perfil.</span>}
            </div>
          </header>

          <div className="perfil-blocos">
            <article className="bloco">
              <h3>Seu histórico na PHD</h3>
              {p.historico ? <p>{p.historico}</p> : <p className="vazio">Ainda não preenchido.</p>}
            </article>

            <article className="bloco">
              <h3>Formação acadêmica</h3>
              {p.formacoes?.length ? (
                <table className="mini">
                  <thead><tr><th>Curso</th><th>Grau</th><th>Período</th><th>Instituição</th></tr></thead>
                  <tbody>
                    {p.formacoes.map((f) => (
                      <tr key={f.id}>
                        <td>{f.curso}</td>
                        <td className="mut">{f.grau ?? "–"}</td>
                        <td className="mut mono">{periodo(f) || "–"}</td>
                        <td className="mut">{f.instituicao ?? "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="vazio">Ainda não preenchido.</p>}
            </article>

            <article className="bloco">
              <h3>Cursos complementares e eventos</h3>
              {p.cursos?.length ? (
                <table className="mini">
                  <thead><tr><th>Mês/ano</th><th>Curso / evento</th><th>Instituição</th><th>Participação</th></tr></thead>
                  <tbody>
                    {p.cursos.map((c) => (
                      <tr key={c.id}>
                        <td className="mut mono">{compBR(c.competencia) || "–"}</td>
                        <td>{c.titulo}</td>
                        <td className="mut">{c.instituicao ?? "–"}</td>
                        <td className="mut">{c.participacao ?? "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="vazio">Ainda não preenchido.</p>}
            </article>

            <article className="bloco">
              <h3>Espaço cultural e de relacionamento</h3>
              <p className="sub">Gostos, hobbies e curiosidades.</p>
              {p.espaco_cultural ? <p>{p.espaco_cultural}</p> : <p className="vazio">Ainda não preenchido.</p>}
            </article>
          </div>
        </>
      )}
    </section>
  );
}
