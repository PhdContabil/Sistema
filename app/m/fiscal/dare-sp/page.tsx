import Workspace from "@/components/Workspace";
import DareSp from "@/components/apps/DareSp";
import { getModule } from "@/lib/modules";
import { listarDebitos, competenciasDisponiveis } from "@/lib/dare-sp";
import { temChaveSefaz } from "@/lib/dare-sp-sefaz";
import { temTokenZen } from "@/lib/dare-sp-zen";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: { competencia?: string };
}) {
  const m = getModule("fiscal")!;

  let competencias: string[] = [];
  let debitos: Awaited<ReturnType<typeof listarDebitos>> = [];
  let erro: string | null = null;

  try {
    competencias = await competenciasDisponiveis();
    const atual = searchParams.competencia || competencias[0] || "";
    debitos = atual ? await listarDebitos(atual) : [];
  } catch (e) {
    erro = e instanceof Error ? e.message : "Falha ao carregar os débitos.";
  }

  const atual = searchParams.competencia || competencias[0] || null;

  return (
    <Workspace moduleId="fiscal" appName="DARE SP">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>DS</div>
        <div>
          <h1>DARE SP</h1>
          <div className="desc">
            ICMS por competência: gera a guia na Sefaz-SP e envia ao Edoc do Zen.
          </div>
        </div>
      </div>
      <DareSp
        competenciasIniciais={competencias}
        competenciaAtual={atual}
        debitosIniciais={debitos}
        temChaveSefaz={temChaveSefaz()}
        temTokenZen={temTokenZen()}
        erroServidor={erro}
      />
    </Workspace>
  );
}
