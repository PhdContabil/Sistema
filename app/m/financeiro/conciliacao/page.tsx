import Workspace from "@/components/Workspace";
import ConciliacaoHonorarios from "@/components/apps/ConciliacaoHonorarios";
import { getModule } from "@/lib/modules";
import { getConciliacaoHonorarios, hasApiKey } from "@/lib/questor";
import { SAMPLE_DADOS } from "@/lib/sample";
import type { ConciliacaoItem } from "@/lib/conciliacao";

export const dynamic = "force-dynamic";

export default async function Page() {
  const m = getModule("financeiro")!;

  // Dados buscados no SERVIDOR: a página já é protegida por login e a chave
  // da API nunca vai ao navegador. Evita qualquer falha de sessão no fetch.
  let dados: ConciliacaoItem[] = [];
  let fonte: "api" | "exemplo" = "exemplo";
  let erro: string | null = null;

  if (!hasApiKey()) {
    dados = SAMPLE_DADOS;
  } else {
    try {
      const r = await getConciliacaoHonorarios();
      dados = r.dados ?? [];
      fonte = "api";
    } catch (e) {
      erro = e instanceof Error ? e.message : "Falha ao consultar a API Questor.";
      dados = [];
    }
  }

  return (
    <Workspace moduleId="financeiro" appName="Conciliação de Honorários">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>CH</div>
        <div>
          <h1>Conciliação de Honorários</h1>
          <div className="desc">Honorários contratados x movimento real de cada setor.</div>
        </div>
      </div>
      <ConciliacaoHonorarios dados={dados} fonte={fonte} erroServidor={erro} />
    </Workspace>
  );
}
