import Workspace from "@/components/Workspace";
import PontoFrame from "@/components/pessoas/PontoFrame";
import { PONTO_DIGITAL_URL } from "@/lib/pessoas/conteudos";

export default function PontoPage() {
  return (
    <Workspace moduleId="pessoas" appName="Ponto Digital">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: "var(--accent)" }}>PD</div>
        <div>
          <h1>Ponto Digital</h1>
          <div className="desc">Registre seu ponto sem sair do sistema.</div>
        </div>
      </div>

      <PontoFrame url={PONTO_DIGITAL_URL} />
    </Workspace>
  );
}
