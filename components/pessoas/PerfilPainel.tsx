"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/societario/supabase-browser";
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

/**
 * Lê o perfil direto do Supabase pelo navegador (a leitura é liberada por RLS).
 * Assim a tela não depende de rota de API — evita qualquer problema de sessão
 * no meio do caminho.
 */
export default function PerfilPainel({ slug, onFechar }: { slug: string; onFechar: () => void }) {
  const [p, setP] = useState<Perfil | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [podeEditar, setPodeEditar] = useState(false);

  useEffect(() => {
    let vivo = true;
    setP(null);
    setErro(null);
    setPodeEditar(false);

    (async () => {
      try {
        const sb = createSupabaseBrowserClient();

        const { data: perfil, error: e1 } = await sb
          .from("pessoas_perfil")
          .select("id,slug,nome,tratamento,cargo,setor,funcao,email,foto_url,historico,espaco_cultural,modelo")
          .eq("slug", slug)
          .maybeSingle();

        if (e1) throw new Error(e1.message);
        if (!perfil) throw new Error("Perfil não encontrado.");
        if (!vivo) return;

        const [{ data: fs }, { data: cs }, { data: auth }] = await Promise.all([
          sb.from("pessoas_formacao")
            .select("id,curso,grau,instituicao,inicio,fim")
            .eq("pessoa_id", perfil.id)
            .order("fim", { ascending: false }),
          sb.from("pessoas_cursos")
            .select("id,tipo,titulo,instituicao,participacao,competencia")
            .eq("pessoa_id", perfil.id)
            .order("competencia", { ascending: false }),
          sb.auth.getUser(),
        ]);

        if (!vivo) return;
        const meuEmail = auth?.user?.email?.toLowerCase() ?? null;
        setPodeEditar(Boolean(meuEmail && perfil.email && String(perfil.email).toLowerCase() === meuEmail));
        setP({ ...(perfil as Perfil), formacoes: fs ?? [], cursos: cs ?? [] });
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Não foi possível carregar o perfil.");
      }
    })();

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
                : <span className="perfil-dica">Só a própria pessoa edita este espaço.</span>}
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
                        <td className="mut">{periodo(f) || "–"}</td>
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
                        <td className="mut">{compBR(c.competencia) || "–"}</td>
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
