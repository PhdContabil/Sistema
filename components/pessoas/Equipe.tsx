"use client";

import { useMemo, useState } from "react";
import { GESTORES, SETORES, TOTAL_PESSOAS, iniciais } from "@/lib/pessoas/equipe";

export default function Equipe() {
  const [busca, setBusca] = useState("");
  const [setorSel, setSetorSel] = useState<string>("todos");

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const todos = [{ id: "gestores", nome: "Gestores", pessoas: GESTORES }, ...SETORES];
    return todos
      .filter((g) => setorSel === "todos" || g.id === setorSel)
      .map((g) => ({ ...g, pessoas: g.pessoas.filter((p) => !q || p.nome.toLowerCase().includes(q) || p.funcao.toLowerCase().includes(q) || p.formacao.toLowerCase().includes(q)) }))
      .filter((g) => g.pessoas.length > 0);
  }, [busca, setorSel]);

  return (
    <>
      <div className="toolbar">
        <input className="search" placeholder="Buscar pessoa, função ou formação…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <span className={`chip ${setorSel === "todos" ? "on" : ""}`} onClick={() => setSetorSel("todos")}>Todos · {TOTAL_PESSOAS}</span>
        <span className={`chip ${setorSel === "gestores" ? "on" : ""}`} onClick={() => setSetorSel("gestores")}>Gestores</span>
        {SETORES.map((s) => (
          <span key={s.id} className={`chip ${setorSel === s.id ? "on" : ""}`} onClick={() => setSetorSel(s.id)}>
            {s.nome.replace(/^Setor /, "")}
          </span>
        ))}
      </div>

      {grupos.map((g) => (
        <section key={g.id} className="grupo">
          <div className="section-label mono">{g.nome} · {g.pessoas.length}</div>
          <div className="pessoas-grid">
            {g.pessoas.map((p) => (
              <div key={p.nome} className="pessoa-card">
                <span className="pessoa-av mono">{iniciais(p.nome)}</span>
                <div className="pessoa-info">
                  <div className="pessoa-nome">{p.nome}</div>
                  <div className="pessoa-func">{p.funcao}</div>
                  <div className="pessoa-form">{p.formacao}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {grupos.length === 0 && <div className="loading">Nenhuma pessoa encontrada.</div>}

      <p className="footnote">Foto, &quot;Sobre mim&quot;, formação, cursos e eventos de cada pessoa serão adicionados numa próxima etapa.</p>
    </>
  );
}
