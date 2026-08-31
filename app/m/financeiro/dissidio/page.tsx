import Workspace from "@/components/Workspace";
import AnaliseDissidio from "@/components/apps/AnaliseDissidio";
import { getModule } from "@/lib/modules";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { getPerfilEmpresas, hasApiKey } from "@/lib/questor";
import { obterRodada, listarAjustes, type PerfilEmpresa, type Rodada, type Ajuste } from "@/lib/dissidio";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: { ano?: string };
}) {
  const m = getModule("financeiro")!;

  const anoAtual = new Date().getFullYear();
  const anosDisponiveis = [anoAtual + 1, anoAtual, anoAtual - 1, anoAtual - 2];

  const pedido = Number(searchParams?.ano);
  const ano = anosDisponiveis.includes(pedido) ? pedido : anoAtual;

  // A comparação olha para trás: os 3 anos-calendário anteriores ou iguais
  // ao ano da rodada. Uma rodada de 2027 compara 2024/2025/2026.
  const base = Math.min(ano, anoAtual);
  const anosComparados = [base - 2, base - 1, base];

  let empresas: PerfilEmpresa[] = [];
  let rodada: Rodada | null = null;
  let ajustes: Ajuste[] = [];
  let erro: string | null = null;

  const user = await getCurrentUser().catch(() => null);
  const meuEmail = user?.email?.toLowerCase() ?? null;

  if (!hasApiKey()) {
    erro = "QUESTOR_API_KEY não configurada no servidor.";
  } else {
    try {
      const [perfil, r, m2] = await Promise.all([
        // Sem `detalhado`: a lista dos serviços de cada empresa só é buscada
        // quando a linha é aberta (/api/dissidio/empresa/[cod]). Traziam ~2,7 mil
        // listas de uma vez e deixavam a página pesada.
        getPerfilEmpresas({ anos: anosComparados }),
        obterRodada(ano, meuEmail),
        listarAjustes(ano),
      ]);
      empresas = (perfil.dados ?? []).sort((a, b) =>
        (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR")
      );
      rodada = r;
      ajustes = [...m2.values()];
    } catch (e) {
      erro = e instanceof Error ? e.message : "Falha ao consultar a API Questor.";
    }
  }

  return (
    <Workspace moduleId="financeiro" appName="Análise de Dissídio">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>AD</div>
        <div>
          <h1>Análise de Dissídio</h1>
          <div className="desc">
            Perfil de cada empresa nos últimos anos e simulação do reajuste anual.
          </div>
        </div>
      </div>
      <AnaliseDissidio
        ano={ano}
        anosDisponiveis={anosDisponiveis}
        anosComparados={anosComparados}
        empresas={empresas}
        rodada={rodada}
        ajustesIniciais={ajustes}
        meuEmail={meuEmail}
        erroServidor={erro}
      />
    </Workspace>
  );
}
