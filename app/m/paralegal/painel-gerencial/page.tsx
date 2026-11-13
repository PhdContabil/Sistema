// Paralegal · Painel Gerencial — visão por processo (responsável, etapa atual,
// o que falta e prazos), calculada na hora a partir do Societário.
import Workspace from "@/components/Workspace";
import AcessoNegado from "@/components/AcessoNegado";
import PainelGerencial from "@/components/apps/paralegal/PainelGerencial";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { getModule } from "@/lib/modules";
import { sbListProcessos } from "@/lib/societario/supabase-store";
import { lerEtapas, rotuloEtapa } from "@/lib/societario/etapaProcesso";
import { hojeSP, montarPainel, porResponsavel, porStatus, resumir } from "@/lib/paralegal/painel";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const m = getModule("paralegal")!;
  const liberado = podeAcessarApp(nivel, "paralegal", "Painel Gerencial");

  let dados: React.ReactNode;
  if (!liberado) {
    dados = <AcessoNegado moduloNome="Painel Gerencial" />;
  } else {
    try {
      const [procs, etapas] = await Promise.all([sbListProcessos(), lerEtapas()]);
      const manuais: Record<string, string> = {};
      for (const [id, e] of Object.entries(etapas)) manuais[id] = rotuloEtapa(e);
      const hoje = hojeSP();
      const lista = montarPainel(procs, manuais, hoje);
      dados = <PainelGerencial hoje={hoje} processos={lista} resumo={resumir(lista)} responsaveis={porResponsavel(lista)} status={porStatus(lista)} />;
    } catch (e) {
      dados = <div className="pg-erro">Não foi possível carregar os processos agora: {e instanceof Error ? e.message : "erro desconhecido"}.</div>;
    }
  }

  return (
    <Workspace moduleId="paralegal" appName="Painel Gerencial">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>PG</div>
        <div>
          <h1>Painel Gerencial</h1>
          <div className="desc">Onde está cada processo, o que ainda falta e os prazos perto de vencer.</div>
        </div>
      </div>
      {dados}
    </Workspace>
  );
}
