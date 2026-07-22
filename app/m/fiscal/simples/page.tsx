import Workspace from "@/components/Workspace";
import LimiteSimples from "@/components/apps/LimiteSimples";
import { getModule } from "@/lib/modules";

export default function Page() {
  const m = getModule("fiscal")!;
  return (
    <Workspace moduleId="fiscal" appName="Simples Nacional">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>SN</div>
        <div>
          <h1>Simples Nacional</h1>
          <div className="desc">Análise de limite, faturamento, projeção e estouro do Simples.</div>
        </div>
      </div>
      <LimiteSimples />
    </Workspace>
  );
}
