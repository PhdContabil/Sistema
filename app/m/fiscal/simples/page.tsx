import Workspace from "@/components/Workspace";
import LimiteSimples from "@/components/apps/LimiteSimples";
import { getModule } from "@/lib/modules";
import { getAnaliseLimite, hasApiKey } from "@/lib/questor";
import { SAMPLE_LIMITE } from "@/lib/sample-fiscal";
import type { AnaliseLimiteResponse } from "@/lib/fiscal";

export const dynamic = "force-dynamic";

export default async function Page() {
  const m = getModule("fiscal")!;

  let resp: AnaliseLimiteResponse = SAMPLE_LIMITE;
  let fonte: "api" | "exemplo" = "exemplo";
  let erro: string | null = null;

  if (hasApiKey()) {
    try {
      resp = await getAnaliseLimite();
      fonte = "api";
    } catch (e) {
      erro = e instanceof Error ? e.message : "Falha ao consultar a API Questor.";
    }
  }

  return (
    <Workspace moduleId="fiscal" appName="Simples Nacional">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>SN</div>
        <div>
          <h1>Simples Nacional</h1>
          <div className="desc">Análise de limite, faturamento, projeção e estouro do Simples.</div>
        </div>
      </div>
      <LimiteSimples resp={resp} fonte={fonte} erroServidor={erro} />
    </Workspace>
  );
}
