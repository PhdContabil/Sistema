// Fiscal · Parcelamentos do Simples Nacional (Integra Contador).
import Workspace from "@/components/Workspace";
import AcessoNegado from "@/components/AcessoNegado";
import Parcelamentos from "@/components/apps/Parcelamentos";
import { getModule } from "@/lib/modules";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";

export const dynamic = "force-dynamic";

export default async function Page() {
  const m = getModule("fiscal")!;
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const liberado = podeAcessarApp(nivel, "fiscal", "Parcelamentos");

  return (
    <Workspace moduleId="fiscal" appName="Parcelamentos">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>PA</div>
        <div>
          <h1>Parcelamentos</h1>
          <div className="desc">Parcelamentos do Simples Nacional (ordinário, especial, PERT-SN e RELP-SN): detalhe, parcelas e DAS, um a um ou em lote.</div>
        </div>
      </div>
      {liberado ? <Parcelamentos /> : <AcessoNegado moduloNome="Parcelamentos" />}
    </Workspace>
  );
}
