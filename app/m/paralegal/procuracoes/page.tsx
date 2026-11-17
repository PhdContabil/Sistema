// Paralegal · Procurações — mesma regra de acesso do resto do Paralegal.
import Workspace from "@/components/Workspace";
import AcessoNegado from "@/components/AcessoNegado";
import Procuracoes from "@/components/apps/Procuracoes";
import { getModule } from "@/lib/modules";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";

export const dynamic = "force-dynamic";

export default async function Page() {
  const m = getModule("paralegal")!;
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const liberado = podeAcessarApp(nivel, "paralegal", "Procurações");

  return (
    <Workspace moduleId="paralegal" appName="Procurações">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>PR</div>
        <div>
          <h1>Procurações</h1>
          <div className="desc">Procurações eletrônicas do e-CAC outorgadas ao escritório: vigência e serviços, via Integra Contador.</div>
        </div>
      </div>
      {liberado ? <Procuracoes /> : <AcessoNegado moduloNome="Paralegal" />}
    </Workspace>
  );
}
