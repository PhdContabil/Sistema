import Workspace from "@/components/Workspace";
import ConsolidacaoDepartamental from "@/components/apps/ConsolidacaoDepartamental";
import { getModule } from "@/lib/modules";
import { getConsolidacaoDepartamental, getSocios, hasApiKey } from "@/lib/questor";
import {
  somarTotais, temPendencia,
  type EmpresaConsolidacao, type GruposContas, type SocioItem, type TotaisConsolidacao,
} from "@/lib/contabil";

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
  let totais: TotaisConsolidacao = {
    folhaContabil: 0, receitaContabil: 0, impostoContabil: 0,
    receitaFiscal: 0, folhaMovimento: 0,
  };
  let totalEmpresas = 0;

  if (!hasApiKey()) {
    erro = "QUESTOR_API_KEY não configurada no servidor.";
  } else {
    try {
      // Os sócios são acessórios: se falharem, a tela funciona sem o filtro.
      const [consol, soc] = await Promise.all([
        getConsolidacaoDepartamental({ ano }),
        getSocios().catch(() => ({ total: 0, dados: [] as SocioItem[] })),
      ]);
      const todas = consol.dados ?? [];
      grupos = consol.grupos ?? GRUPOS_VAZIOS;
      geradoEm = consol.gerado_em ?? null;
      socios = soc.dados ?? [];

      // Os cartões somam TODAS as empresas — são o total do escritório e
      // precisam bater com o relatório, independente do que a tabela lista.
      totais = somarTotais(todas);
      totalEmpresas = todas.length;

      // A tabela leva só quem tem pendência. Filtrar aqui, no servidor, evita
      // mandar ~1,3 mil empresas limpas para o navegador à toa.
      dados = todas.filter(temPendencia);
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
        totais={totais}
        totalEmpresas={totalEmpresas}
        geradoEm={geradoEm}
        erroServidor={erro}
      />
    </Workspace>
  );
}
