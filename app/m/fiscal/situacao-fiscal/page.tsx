// Fiscal · Situação Fiscal — restrita a quem acessa o módulo Fiscal
// (setor "fiscal", T.I. ou Diretoria), mesma regra do resto do módulo.
import Workspace from "@/components/Workspace";
import AcessoNegado from "@/components/AcessoNegado";
import SituacaoFiscal from "@/components/apps/SituacaoFiscal";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { getModule } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const m = getModule("fiscal")!;
  const liberado = podeAcessarApp(nivel, "fiscal", "Situação Fiscal");

  return (
    <Workspace moduleId="fiscal" appName="Situação Fiscal">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>SF</div>
        <div>
          <h1>Situação Fiscal</h1>
          <div className="desc">Relatório SITFIS da Receita Federal via Integra Contador: pendências, Simples/SIMEI e certidão.</div>
        </div>
      </div>
      {liberado ? <SituacaoFiscal /> : <AcessoNegado moduloNome="Situação Fiscal" />}
    </Workspace>
  );
}
