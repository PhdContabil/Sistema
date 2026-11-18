// Trabalhista · Recálculos — compartilhado com o Fiscal (mesma tela, mesma regra de acesso).
import Workspace from "@/components/Workspace";
import AcessoNegado from "@/components/AcessoNegado";
import Recalculos from "@/components/apps/Recalculos";
import { getModule } from "@/lib/modules";
import { getCurrentUser } from "@/lib/societario/supabase-server";
import { obterNivelAcesso, podeAcessarApp } from "@/lib/acesso";

export const dynamic = "force-dynamic";

export default async function Page() {
  const m = getModule("trabalhista")!;
  const user = await getCurrentUser().catch(() => null);
  const nivel = await obterNivelAcesso(user?.email);
  const liberado = podeAcessarApp(nivel, "trabalhista", "Recálculos");

  return (
    <Workspace moduleId="trabalhista" appName="Recálculos">
      <div className="app-head">
        <div className="app-ic mono" style={{ background: m.color }}>RC</div>
        <div>
          <h1>Recálculos</h1>
          <div className="desc">Guia atualizada para uma nova data de pagamento via Integra Contador. Controle compartilhado com o Fiscal.</div>
        </div>
      </div>
      {liberado ? <Recalculos /> : <AcessoNegado moduloNome="Recálculos" />}
    </Workspace>
  );
}
