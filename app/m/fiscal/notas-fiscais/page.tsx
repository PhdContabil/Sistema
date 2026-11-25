// Fiscal · Notas Fiscais — emissão de NFS-e de clientes do Simples pelo Portal Nacional
// (certificado da PHD + procuração do cliente). Mesma regra de acesso do módulo Fiscal.
import Workspace from "@/components/Workspace";
import AcessoNegado from "@/components/AcessoNegado";
import NotasFiscais from "@/components/apps/fiscal/NotasFiscais";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";
import { getModule } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const m = getModule("fiscal")!;
  const liberado = podeAcessarApp(nivel, "fiscal", "Notas Fiscais");

  return (
    <Workspace moduleId="fiscal" appName="Notas Fiscais">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>NF</div>
        <div>
          <h1>Notas Fiscais</h1>
          <div className="desc">NFS-e de clientes do Simples pelo Portal Nacional, com o certificado da PHD e a procuração do cliente.</div>
        </div>
      </div>
      {liberado ? <NotasFiscais /> : <AcessoNegado moduloNome="Notas Fiscais" />}
    </Workspace>
  );
}
