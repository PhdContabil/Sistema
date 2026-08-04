import { GESTORES, SETORES, TOTAL_PESSOAS, iniciais } from "@/lib/pessoas/equipe";

export default function Hierarquia() {
  return (
    <div className="organograma">
      <div className="org-nivel">
        <div className="org-rotulo mono">Gestores</div>
        <div className="org-linha">
          {GESTORES.map((g) => (
            <div key={g.nome} className="org-card gestor">
              <span className="org-av mono">{iniciais(g.nome)}</span>
              <div>
                <div className="org-nome">{g.nome}</div>
                <div className="org-func">{g.funcao}</div>
                <div className="org-form">{g.formacao}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="org-tronco" />

      <div className="org-nivel">
        <div className="org-rotulo mono">Setores · {SETORES.length} · {TOTAL_PESSOAS} pessoas no total</div>
        <div className="org-setores">
          {SETORES.map((s) => (
            <div key={s.id} className="org-setor">
              <div className="org-setor-head">
                {s.nome}
                <span className="org-qtd mono">{s.pessoas.length}</span>
              </div>
              <ul className="org-lista">
                {s.pessoas.map((p) => (
                  <li key={p.nome}>
                    <span className="org-av sm mono">{iniciais(p.nome)}</span>
                    <span>
                      <span className="org-nome sm">{p.nome}</span>
                      <span className="org-func sm">{p.funcao}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
