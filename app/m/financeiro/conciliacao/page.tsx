import Workspace from "@/components/Workspace";
import ConciliacaoHonorarios from "@/components/apps/ConciliacaoHonorarios";
import { getModule } from "@/lib/modules";
import { getConciliacaoHonorarios, hasApiKey } from "@/lib/questor";
import { SAMPLE_DADOS } from "@/lib/sample";
import {
  agruparServicosPorEmpresa, recalcularPorEmpresa, servicosSemConta,
  type ConciliacaoItem, type ServicoContratado,
} from "@/lib/conciliacao";

export const dynamic = "force-dynamic";

export default async function Page() {
  const m = getModule("financeiro")!;

  // Dados buscados no SERVIDOR: a página já é protegida por login e a chave
  // da API nunca vai ao navegador. Evita qualquer falha de sessão no fetch.
  let dados: ConciliacaoItem[] = [];
  let fonte: "api" | "exemplo" = "exemplo";
  let erro: string | null = null;

  let detalhado = false;
  let redistribuido = false;
  let semConta = 0;

  if (!hasApiKey()) {
    dados = SAMPLE_DADOS;
  } else {
    try {
      // detalhado=true traz os serviços linha a linha (com a observação [COD:nnn])
      const r = await getConciliacaoHonorarios(undefined, true);
      dados = r.dados ?? [];
      fonte = "api";

      // Reatribui serviços marcados e calcula o MEI por empresa
      const todos: ServicoContratado[] = dados.flatMap((d) => d.servicos ?? []);
      detalhado = todos.length > 0;

      if (detalhado) {
        const ajustes = agruparServicosPorEmpresa(todos);

        // Blocos recalculados a partir dos serviços: os valores passam a
        // aparecer NA LINHA DA EMPRESA CORRETA. Serviço sem conta cai em
        // "demais" (mesmo critério da API) e não bloqueia a redistribuição.
        redistribuido = true;
        semConta = servicosSemConta(todos);
        const recalc = recalcularPorEmpresa(todos);

        // Empresas que só existem por reatribuição (não vinham na lista original)
        const existentes = new Set(dados.map((d) => d.codigoempresa));

        dados = dados.map((d) => {
          const a = ajustes.get(d.codigoempresa);
          const r = recalc?.get(d.codigoempresa);
          return {
            ...d,
            financeiro: r ? r.financeiro : d.financeiro,
            mei: r ? r.mei : a?.mei,
            // com redistribuição real o aviso não é mais necessário
            ajuste: redistribuido
              ? undefined
              : a && { saiu: a.saiu, entrou: a.entrou, destinos: a.destinos, origens: a.origens },
          };
        });

        // Acrescenta empresas que passaram a ter honorário só via [COD:]
        if (recalc) {
          for (const [cod, r] of recalc) {
            if (!existentes.has(cod) && r.financeiro.total > 0) {
              dados.push({
                codigoempresa: cod,
                nome: null,
                cnpj: null,
                financeiro: r.financeiro,
                setores: { empregados: 0, prolabore: 0, faturamento_mensal: 0, lancamentos_media6m: 0 },
                mei: r.mei,
              });
            }
          }
        }
      }
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
      <ConciliacaoHonorarios
        dados={dados}
        fonte={fonte}
        erroServidor={erro}
        detalhado={detalhado}
        redistribuido={redistribuido}
        semConta={semConta}
      />
    </Workspace>
  );
}
