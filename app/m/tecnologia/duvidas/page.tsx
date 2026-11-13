import Workspace from "@/components/Workspace";
import { getModule } from "@/lib/modules";
import { DUVIDAS } from "@/lib/tecnologia/duvidas";
import DuvidasFrequentes from "@/components/apps/DuvidasFrequentes";

export default function Page() {
  const m = getModule("tecnologia")!;

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
        <DuvidasFrequentes duvidas={DUVIDAS} cor={m.color} />
      )}
    </Workspace>
  );
}
