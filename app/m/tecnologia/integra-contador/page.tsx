// Tecnologia · Integra Contador — certificado A1 da PHD e credenciais SERPRO,
// usados por Situação Fiscal, Procurações e DCTFWeb. Só T.I./Diretoria.
import Workspace from "@/components/Workspace";
import AcessoNegado from "@/components/AcessoNegado";
import IntegraContador from "@/components/apps/IntegraContador";
import { getModule } from "@/lib/modules";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarAppTecnologia } from "@/lib/acesso";

export const dynamic = "force-dynamic";

export default async function Page() {
  const m = getModule("tecnologia")!;
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const liberado = podeAcessarAppTecnologia(nivel, "/m/tecnologia/integra-contador");

  return (
    <Workspace moduleId="tecnologia" appName="Integra Contador">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>IC</div>
        <div>
          <h1>Integra Contador</h1>
          <div className="desc">Certificado A1 da PHD e credenciais do SERPRO usados pela Situação Fiscal, Procurações e DCTFWeb.</div>
        </div>
      </div>
      {liberado ? <IntegraContador /> : <AcessoNegado moduloNome="Integra Contador" />}
    </Workspace>
  );
}
