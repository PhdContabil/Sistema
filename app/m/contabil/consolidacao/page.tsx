import Workspace from "@/components/Workspace";
import ConsolidacaoDepartamental from "@/components/apps/ConsolidacaoDepartamental";
import { getModule } from "@/lib/modules";
import { getConsolidacaoDepartamental, getSocios, hasApiKey } from "@/lib/questor";
import type { EmpresaConsolidacao, GruposContas, SocioItem } from "@/lib/contabil";

export const dynamic = "force-dynamic";

const GRUPOS_VAZIOS: GruposContas = { folha: [], receita: [], imposto: [] };

export default async function Page({
  searchParams,
}: {
  searchParams: { ano?: string };
}) {
  const m = getModule("contabil")!;

  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const anosDisponiveis = [anoAtual, anoAtual - 1, anoAtual - 2, anoAtual - 3, anoAtual - 4];

  const pedido = Number(searchParams?.ano);
  const ano = anosDisponiveis.includes(pedido) ? pedido : anoAtual;

  let dados: EmpresaConsolidacao[] = [];
  let grupos: GruposContas = GRUPOS_VAZIOS;
  let socios: SocioItem[] = [];
  let geradoEm: string | null = null;
  let erro: string | null = null;

  if (!hasApiKey()) {
    erro = "QUESTOR_API_KEY não configurada no servidor.";
  } else {
    try {
      // Os sócios são acessórios: se falharem, a tela funciona sem o filtro.
      const [consol, soc] = await Promise.all([
        getConsolidacaoDepartamental({ ano }),
        getSocios().catch(() => ({ total: 0, dados: [] as SocioItem[] })),
      ]);
      dados = consol.dados ?? [];
      grupos = consol.grupos ?? GRUPOS_VAZIOS;
      geradoEm = consol.gerado_em ?? null;
      socios = soc.dados ?? [];
    } catch (e) {
      erro = e instanceof Error ? e.message : "Falha ao consultar a API Questor.";
    }
  }

  return (
    <Workspace moduleId="contabil" appName="Consolidação Departamental">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>CD</div>
        <div>
          <h1>Consolidação Departamental</h1>
          <div className="desc">
            O que cada empresa movimentou x o que foi contabilizado, mês a mês.
          </div>
        </div>
      </div>
      <ConsolidacaoDepartamental
        ano={ano}
        anosDisponiveis={anosDisponiveis}
        dados={dados}
        grupos={grupos}
        socios={socios}
        geradoEm={geradoEm}
        erroServidor={erro}
      />
    </Workspace>
  );
}
