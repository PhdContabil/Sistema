import Workspace from "@/components/Workspace";
import { getModule } from "@/lib/modules";
import { DUVIDAS } from "@/lib/tecnologia/duvidas";

export default function Page() {
  const m = getModule("tecnologia")!;
  const categorias = Array.from(new Set(DUVIDAS.map((d) => d.categoria)));

  return (
    <Workspace moduleId="tecnologia" appName="Dúvidas Frequentes">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>DF</div>
        <div>
          <h1>Dúvidas Frequentes</h1>
          <div className="desc">Respostas rápidas para as dúvidas mais comuns de T.I. Não achou? Abra um ticket.</div>
        </div>
      </div>

      {DUVIDAS.length === 0 ? (
        <div className="painel-api" style={{ marginTop: 18, padding: 24, textAlign: "center", opacity: 0.8 }}>
          Ainda não há dúvidas cadastradas.
        </div>
      ) : (
        categorias.map((cat) => (
          <section key={cat} style={{ marginTop: 22 }}>
            <h3 style={{ marginBottom: 10 }}>{cat}</h3>
            {DUVIDAS.filter((d) => d.categoria === cat).map((d) => (
              <details key={d.pergunta} className="painel-api" style={{ marginBottom: 8, padding: "12px 16px" }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>{d.pergunta}</summary>
                <div style={{ marginTop: 10, lineHeight: 1.55 }}>
                  {d.resposta.split(/\n\s*\n/).map((p, i) => (
                    <p key={i} style={{ margin: "0 0 8px", whiteSpace: "pre-line" }}>{p}</p>
                  ))}
                </div>
              </details>
            ))}
          </section>
        ))
      )}
    </Workspace>
  );
}
