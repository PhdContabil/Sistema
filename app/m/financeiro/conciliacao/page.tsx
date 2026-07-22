import Workspace from "@/components/Workspace";
import ConciliacaoHonorarios from "@/components/apps/ConciliacaoHonorarios";
import { getModule } from "@/lib/modules";

export default function Page() {
  const m = getModule("financeiro")!;
  return (
    <Workspace moduleId="financeiro" appName="Conciliação de Honorários">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>CH</div>
        <div>
          <h1>Conciliação de Honorários</h1>
          <div className="desc">Honorários contratados x movimento real de cada setor.</div>
        </div>
      </div>
      <ConciliacaoHonorarios />
    </Workspace>
  );
}
