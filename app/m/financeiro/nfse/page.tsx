import Workspace from "@/components/Workspace";
import EmissaoNfse from "@/components/apps/EmissaoNfse";
import { getModule } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default function Page() {
  const m = getModule("financeiro")!;
  return (
    <Workspace moduleId="financeiro" appName="Emissão NFS-e PHD">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>NF</div>
        <div>
          <h1>Emissão NFS-e PHD</h1>
          <div className="desc">
            Notas da PHD em Taboão da Serra: importa as RPS, emite na prefeitura em ordem, baixa o PDF e publica no Zen.
          </div>
        </div>
      </div>
      <EmissaoNfse />
    </Workspace>
  );
}
